import { and, eq, gt, sql } from 'drizzle-orm';
import {
  normalizeTeamEmail,
  resolveCanonicalOrigin,
  type CanonicalOrigin,
  type ParticipantMemoryAccessPurpose,
  type ParticipantMemoryIdentity,
  type RequestContext,
} from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { entries, registrationGroups } from './schema/entries.js';
import {
  participantMemoryAccess,
  participantMemoryRequests,
} from './participant-memory-schema.js';
import { retryOnConflict } from './transaction-retry.js';
import {
  closeConsent,
  lockParticipant,
  memoryEnabled,
  purgeParticipant,
} from './participant-memory-support.js';
import {
  hashParticipantMemoryToken,
  newParticipantMemoryNonce,
  participantMemoryTokenPattern,
} from './participant-memory-token.js';

const MINUTE = 60_000;
export const lifetimeMs = {
  access: 30 * MINUTE,
  delete: 24 * 60 * MINUTE,
} as const;
const SESSION_MS = 60 * MINUTE;

/** An e-mail counts as verified once an entry of one of its registration groups was e-mail-confirmed. */
export async function verifiedEmailKnown(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
) {
  const [row] = await tx
    .select({ id: entries.id })
    .from(entries)
    .innerJoin(
      registrationGroups,
      and(
        eq(registrationGroups.organizationId, entries.organizationId),
        eq(registrationGroups.id, entries.registrationGroupId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, organizationId),
        eq(entries.verificationStatus, 'verified'),
        sql`${entries.deletedAt} is null`,
        sql`lower(trim(${registrationGroups.contactEmail})) = ${email}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export function createParticipantMemoryAccess(
  db: Database,
  options: { tokenKey: string; canonicalOrigin: CanonicalOrigin },
) {
  /**
   * Lock first, then the link: the participant lock is taken before any access row is
   * touched, the same order every other path uses (a link request revokes rows under
   * that lock). The row is looked up unlocked to learn whose lock to take, then
   * consumed with its conditions checked again.
   */
  const consume = async (
    tx: TransactionDatabase,
    ctx: RequestContext,
    token: string,
    purpose: ParticipantMemoryAccessPurpose,
  ) => {
    const match = and(
      eq(participantMemoryAccess.organizationId, ctx.organizationId),
      eq(participantMemoryAccess.purpose, purpose),
      eq(participantMemoryAccess.tokenHash, hashParticipantMemoryToken(token)),
      sql`${participantMemoryAccess.consumedAt} is null`,
      sql`${participantMemoryAccess.revokedAt} is null`,
      gt(participantMemoryAccess.expiresAt, new Date()),
    );
    const [peek] = await tx
      .select({ email: participantMemoryAccess.email })
      .from(participantMemoryAccess)
      .where(match);
    if (!peek) return [];
    await lockParticipant(tx, ctx.organizationId, peek.email);
    return tx
      .update(participantMemoryAccess)
      .set({ consumedAt: new Date() })
      .where(match)
      .returning({ email: participantMemoryAccess.email });
  };
  return {
    /**
     * The same work for every address, known or not: validate, write one queue row, answer.
     * What this club knows about the address is decided later by the worker, so neither
     * the answer nor its duration depends on it.
     */
    async requestAccess(
      ctx: RequestContext,
      rawEmail: string,
      purpose: ParticipantMemoryAccessPurpose,
      locale: 'de' | 'en',
    ) {
      let email: string;
      try {
        email = normalizeTeamEmail(rawEmail);
      } catch {
        return;
      }
      if (!(await resolveCanonicalOrigin(options.canonicalOrigin, ctx))) return;
      await db
        .insert(participantMemoryRequests)
        .values({ organizationId: ctx.organizationId, email, purpose, locale })
        .onConflictDoNothing();
    },
    async redeemAccess(ctx: RequestContext, token: string) {
      if (!participantMemoryTokenPattern.test(token)) return null;
      return retryOnConflict(() =>
        db.transaction(async (tx) => {
          const [link] = await consume(tx, ctx, token, 'access');
          if (!link || !(await memoryEnabled(tx, ctx.organizationId)))
            return null;
          const session = newParticipantMemoryNonce();
          await tx.insert(participantMemoryAccess).values({
            organizationId: ctx.organizationId,
            email: link.email,
            purpose: 'session',
            tokenHash: hashParticipantMemoryToken(session),
            expiresAt: new Date(Date.now() + SESSION_MS),
          });
          return session;
        }),
      );
    },
    async redeemDelete(ctx: RequestContext, token: string) {
      if (!participantMemoryTokenPattern.test(token)) return false;
      return retryOnConflict(() =>
        db.transaction(async (tx) => {
          const [link] = await consume(tx, ctx, token, 'delete');
          if (!link) return false;
          await purgeParticipant(tx, ctx.organizationId, link.email, {
            revokeSessions: true,
          });
          await closeConsent(tx, ctx.organizationId, link.email, 'deleted');
          return true;
        }),
      );
    },
    async session(
      ctx: RequestContext,
      token: string,
    ): Promise<ParticipantMemoryIdentity | null> {
      if (!participantMemoryTokenPattern.test(token)) return null;
      const [row] = await db
        .select({ email: participantMemoryAccess.email })
        .from(participantMemoryAccess)
        .where(
          and(
            eq(participantMemoryAccess.organizationId, ctx.organizationId),
            eq(participantMemoryAccess.purpose, 'session'),
            eq(
              participantMemoryAccess.tokenHash,
              hashParticipantMemoryToken(token),
            ),
            sql`${participantMemoryAccess.revokedAt} is null`,
            gt(participantMemoryAccess.expiresAt, new Date()),
          ),
        );
      return row
        ? { organizationId: ctx.organizationId, email: row.email }
        : null;
    },
    async endSession(ctx: RequestContext, token: string) {
      if (!participantMemoryTokenPattern.test(token)) return;
      await db
        .update(participantMemoryAccess)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(participantMemoryAccess.organizationId, ctx.organizationId),
            eq(participantMemoryAccess.purpose, 'session'),
            eq(
              participantMemoryAccess.tokenHash,
              hashParticipantMemoryToken(token),
            ),
          ),
        );
    },
  };
}
