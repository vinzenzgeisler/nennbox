import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  effectiveParticipantMemoryRetentionDays,
  type ParticipantMemoryRetention,
} from '@nennbox/core';
import type { Database } from './database.js';
import {
  participantMemoryAccess,
  participantMemoryConsents,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemorySettings,
  participantMemoryVehicles,
} from './participant-memory-schema.js';
import {
  CONSENT_LOG_RETENTION_DAYS,
  DAY_MS,
} from './participant-memory-support.js';

export interface ParticipantMemoryCleanupResult {
  removed: number;
  consentsClosed: number;
}

/**
 * Deletes expired memory data of exactly one organization. Work is done in
 * short batches, every statement filters by organization id, and nothing locks
 * a table: concurrent registrations and other tenants are not blocked.
 */
export function createParticipantMemoryCleanup(
  db: Database,
  bounds: ParticipantMemoryRetention,
  batchSize = 500,
) {
  return {
    async cleanupOrganization(
      organizationId: string,
      now = new Date(),
    ): Promise<ParticipantMemoryCleanupResult> {
      const [settings] = await db
        .select()
        .from(participantMemorySettings)
        .where(eq(participantMemorySettings.organizationId, organizationId));
      const days = effectiveParticipantMemoryRetentionDays(
        settings?.retentionDays,
        bounds,
      );
      const cutoff = new Date(now.getTime() - days * DAY_MS);
      let removed = 0;
      for (const table of [
        participantMemoryVehicles,
        participantMemoryDocuments,
      ] as const)
        for (;;) {
          const batch = await db
            .select({ id: table.id })
            .from(table)
            .where(
              and(
                eq(table.organizationId, organizationId),
                lt(table.capturedAt, cutoff),
              ),
            )
            .limit(batchSize);
          if (!batch.length) break;
          const deleted = await db
            .delete(table)
            .where(
              and(
                eq(table.organizationId, organizationId),
                inArray(
                  table.id,
                  batch.map((row) => row.id),
                ),
                lt(table.capturedAt, cutoff),
              ),
            )
            .returning({ id: table.id });
          removed += deleted.length;
        }
      for (const table of [
        participantMemoryProfiles,
        participantMemoryPassengers,
      ] as const)
        for (;;) {
          const batch = await db
            .select({ email: table.email })
            .from(table)
            .where(
              and(
                eq(table.organizationId, organizationId),
                lt(table.capturedAt, cutoff),
              ),
            )
            .limit(batchSize);
          if (!batch.length) break;
          const deleted = await db
            .delete(table)
            .where(
              and(
                eq(table.organizationId, organizationId),
                inArray(
                  table.email,
                  batch.map((row) => row.email),
                ),
                lt(table.capturedAt, cutoff),
              ),
            )
            .returning({ email: table.email });
          removed += deleted.length;
        }
      // Consent whose data is gone has nothing left to cover: close it.
      const closed = await db
        .update(participantMemoryConsents)
        .set({ revokedAt: now, revokedReason: 'expired' })
        .where(
          and(
            eq(participantMemoryConsents.organizationId, organizationId),
            sql`${participantMemoryConsents.revokedAt} is null`,
            lt(participantMemoryConsents.grantedAt, cutoff),
            ...[
              participantMemoryProfiles,
              participantMemoryVehicles,
              participantMemoryPassengers,
              participantMemoryDocuments,
            ].map(
              (table) =>
                sql`not exists (select 1 from ${table} where ${table.organizationId} = ${participantMemoryConsents.organizationId} and ${table.email} = ${participantMemoryConsents.email})`,
            ),
          ),
        )
        .returning({ id: participantMemoryConsents.id });
      // Revoked consent rows are the only trace kept; they follow the fixed log retention.
      await db
        .delete(participantMemoryConsents)
        .where(
          and(
            eq(participantMemoryConsents.organizationId, organizationId),
            lt(
              participantMemoryConsents.revokedAt,
              new Date(now.getTime() - CONSENT_LOG_RETENTION_DAYS * DAY_MS),
            ),
          ),
        );
      await db
        .delete(participantMemoryAccess)
        .where(
          and(
            eq(participantMemoryAccess.organizationId, organizationId),
            lt(
              participantMemoryAccess.expiresAt,
              new Date(now.getTime() - DAY_MS),
            ),
          ),
        );
      return { removed, consentsClosed: closed.length };
    },
  };
}
