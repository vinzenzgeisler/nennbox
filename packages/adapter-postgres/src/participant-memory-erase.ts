import { and, eq } from 'drizzle-orm';
import {
  normalizeTeamEmail,
  ProviderError,
  type RequestContext,
} from '@nennbox/core';
import type { Database } from './database.js';
import {
  participantMemoryAudit,
  participantMemoryRequests,
} from './participant-memory-schema.js';
import {
  closeConsent,
  lockParticipant,
  purgeParticipant,
} from './participant-memory-support.js';
import { participantMemoryEmailHash } from './participant-memory-token.js';

/**
 * The organization erases the memory of one person (e.g. after an erasure request
 * under Art. 17 GDPR), independent of the organization-wide switch. Bound to the
 * administrator's organization, audited with who did it; the address is recorded
 * only as organization-bound hash.
 */
export function createParticipantMemoryErase(
  db: Database,
  options: { tokenKey: string },
) {
  return {
    async eraseParticipant(
      ctx: RequestContext,
      rawEmail: string,
    ): Promise<{ removed: number }> {
      if (!ctx.permissions.has('organization:update') || !ctx.subject)
        throw new ProviderError('forbidden', 'forbidden');
      const email = normalizeTeamEmail(rawEmail);
      const org = ctx.organizationId;
      const subject = ctx.subject;
      return db.transaction(async (tx) => {
        await lockParticipant(tx, org, email);
        const removed = await purgeParticipant(tx, org, email, {
          revokeSessions: true,
        });
        await tx
          .delete(participantMemoryRequests)
          .where(
            and(
              eq(participantMemoryRequests.organizationId, org),
              eq(participantMemoryRequests.email, email),
            ),
          );
        await closeConsent(tx, org, email, 'erased');
        await tx.insert(participantMemoryAudit).values({
          organizationId: org,
          action: 'erased',
          emailHash: participantMemoryEmailHash(options.tokenKey, org, email),
          actorIssuer: subject.issuer,
          actorSubject: subject.subject,
          removedRows: removed,
        });
        return { removed };
      });
    },
  };
}
