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
import { enqueueMailOutbox } from './mail-outbox.js';
import { entries, registrationGroups } from './schema/entries.js';
import { participantMemoryAccess } from './participant-memory-schema.js';
import {
  activeConsent,
  closeConsent,
  hasStoredData,
  lockParticipant,
  memoryEnabled,
  purgeParticipant,
} from './participant-memory-support.js';
import {
  deriveParticipantMemoryToken,
  hashParticipantMemoryToken,
  newParticipantMemoryNonce,
  participantMemoryTokenPattern,
} from './participant-memory-token.js';

const MINUTE = 60_000;
const lifetimeMs = { access: 30 * MINUTE, delete: 24 * 60 * MINUTE } as const;
const SESSION_MS = 60 * MINUTE;
/** One link per address and purpose at a time: no mail flooding through the public form. */
const RESEND_AFTER_MS = MINUTE;

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
  const consume = (
    tx: TransactionDatabase,
    ctx: RequestContext,
    token: string,
    purpose: ParticipantMemoryAccessPurpose,
  ) =>
    tx
      .update(participantMemoryAccess)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(participantMemoryAccess.organizationId, ctx.organizationId),
          eq(participantMemoryAccess.purpose, purpose),
          eq(
            participantMemoryAccess.tokenHash,
            hashParticipantMemoryToken(token),
          ),
          sql`${participantMemoryAccess.consumedAt} is null`,
          sql`${participantMemoryAccess.revokedAt} is null`,
          gt(participantMemoryAccess.expiresAt, new Date()),
        ),
      )
      .returning({ email: participantMemoryAccess.email });
  return {
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
      await db.transaction(async (tx) => {
        if (!(await memoryEnabled(tx, ctx.organizationId))) return;
        await lockParticipant(tx, ctx.organizationId, email);
        const eligible =
          purpose === 'access'
            ? await verifiedEmailKnown(tx, ctx.organizationId, email)
            : Boolean(await activeConsent(tx, ctx.organizationId, email)) ||
              (await hasStoredData(tx, ctx.organizationId, email));
        if (!eligible) return;
        const [recent] = await tx
          .select({ id: participantMemoryAccess.id })
          .from(participantMemoryAccess)
          .where(
            and(
              eq(participantMemoryAccess.organizationId, ctx.organizationId),
              eq(participantMemoryAccess.email, email),
              eq(participantMemoryAccess.purpose, purpose),
              gt(
                participantMemoryAccess.createdAt,
                new Date(Date.now() - RESEND_AFTER_MS),
              ),
            ),
          )
          .limit(1);
        if (recent) return;
        await tx
          .update(participantMemoryAccess)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(participantMemoryAccess.organizationId, ctx.organizationId),
              eq(participantMemoryAccess.email, email),
              eq(participantMemoryAccess.purpose, purpose),
              sql`${participantMemoryAccess.consumedAt} is null`,
              sql`${participantMemoryAccess.revokedAt} is null`,
            ),
          );
        const nonce = newParticipantMemoryNonce();
        const token = deriveParticipantMemoryToken(
          options.tokenKey,
          purpose,
          nonce,
        );
        const [row] = await tx
          .insert(participantMemoryAccess)
          .values({
            organizationId: ctx.organizationId,
            email,
            purpose,
            tokenHash: hashParticipantMemoryToken(token),
            expiresAt: new Date(Date.now() + lifetimeMs[purpose]),
          })
          .returning({ id: participantMemoryAccess.id });
        await enqueueMailOutbox(
          db,
          ctx.organizationId,
          {
            templateKey: `participant-memory-${purpose === 'access' ? 'link' : 'delete'}`,
            templateVersion: 1,
            locale,
            recipient: email,
            idempotencyKey: `participant-memory:${row!.id}`,
            variables: { accessNonce: nonce },
          },
          tx,
        );
      });
    },
    async redeemAccess(ctx: RequestContext, token: string) {
      if (!participantMemoryTokenPattern.test(token)) return null;
      return db.transaction(async (tx) => {
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
      });
    },
    async redeemDelete(ctx: RequestContext, token: string) {
      if (!participantMemoryTokenPattern.test(token)) return false;
      return db.transaction(async (tx) => {
        const [link] = await consume(tx, ctx, token, 'delete');
        if (!link) return false;
        await lockParticipant(tx, ctx.organizationId, link.email);
        await purgeParticipant(tx, ctx.organizationId, link.email, {
          revokeSessions: true,
        });
        await closeConsent(tx, ctx.organizationId, link.email, 'deleted');
        return true;
      });
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
