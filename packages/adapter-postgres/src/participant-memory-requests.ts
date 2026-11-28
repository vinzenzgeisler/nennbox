import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { ParticipantMemoryAccessPurpose } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import { lifetimeMs, verifiedEmailKnown } from './participant-memory-access.js';
import {
  participantMemoryAccess,
  participantMemoryRequests,
} from './participant-memory-schema.js';
import {
  activeConsent,
  hasStoredData,
  lockParticipant,
  memoryEnabled,
} from './participant-memory-support.js';
import {
  deriveParticipantMemoryToken,
  hashParticipantMemoryToken,
  newParticipantMemoryNonce,
} from './participant-memory-token.js';
import { retryOnConflict } from './transaction-retry.js';

/** One link per address and purpose at a time: no mail flooding through the public form. */
export const RESEND_AFTER_MS = 60_000;

type LinkRequest = typeof participantMemoryRequests.$inferSelect;

/**
 * Decides one queued request: only an address this club knows (and, for deletion,
 * stores data for) gets a link. Participant lock first, then the access rows.
 */
async function deliver(
  db: Database,
  tx: TransactionDatabase,
  request: LinkRequest,
  tokenKey: string,
) {
  const { organizationId, email } = request;
  const purpose = request.purpose as ParticipantMemoryAccessPurpose;
  if (!(await memoryEnabled(tx, organizationId))) return;
  await lockParticipant(tx, organizationId, email);
  const eligible =
    purpose === 'access'
      ? await verifiedEmailKnown(tx, organizationId, email)
      : Boolean(await activeConsent(tx, organizationId, email)) ||
        (await hasStoredData(tx, organizationId, email));
  if (!eligible) return;
  const [recent] = await tx
    .select({ id: participantMemoryAccess.id })
    .from(participantMemoryAccess)
    .where(
      and(
        eq(participantMemoryAccess.organizationId, organizationId),
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
        eq(participantMemoryAccess.organizationId, organizationId),
        eq(participantMemoryAccess.email, email),
        eq(participantMemoryAccess.purpose, purpose),
        sql`${participantMemoryAccess.consumedAt} is null`,
        sql`${participantMemoryAccess.revokedAt} is null`,
      ),
    );
  const nonce = newParticipantMemoryNonce();
  const token = deriveParticipantMemoryToken(tokenKey, purpose, nonce);
  const [row] = await tx
    .insert(participantMemoryAccess)
    .values({
      organizationId,
      email,
      purpose,
      tokenHash: hashParticipantMemoryToken(token),
      expiresAt: new Date(Date.now() + lifetimeMs[purpose]),
    })
    .returning({ id: participantMemoryAccess.id });
  await enqueueMailOutbox(
    db,
    organizationId,
    {
      templateKey: `participant-memory-${purpose === 'access' ? 'link' : 'delete'}`,
      templateVersion: 1,
      locale: request.locale as 'de' | 'en',
      recipient: email,
      idempotencyKey: `participant-memory:${row!.id}`,
      variables: { accessNonce: nonce },
    },
    tx,
  );
}

/**
 * Worker side of the link requests. Each request is taken, decided and removed in
 * one transaction, so a failure leaves it for the next run and a link is never
 * mailed twice. Returns how many requests were handled.
 */
export function createParticipantMemoryRequestProcessor(
  db: Database,
  options: { tokenKey: string },
) {
  return {
    async processPending(limit = 50): Promise<number> {
      let handled = 0;
      while (handled < limit) {
        const took = await retryOnConflict(() =>
          db.transaction(async (tx) => {
            const [request] = await tx
              .select()
              .from(participantMemoryRequests)
              .orderBy(asc(participantMemoryRequests.createdAt))
              .limit(1)
              .for('update', { skipLocked: true });
            if (!request) return false;
            await tx
              .delete(participantMemoryRequests)
              .where(eq(participantMemoryRequests.id, request.id));
            await deliver(db, tx, request, options.tokenKey);
            return true;
          }),
        );
        if (!took) break;
        handled += 1;
      }
      return handled;
    },
  };
}
