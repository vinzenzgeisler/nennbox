import { and, eq, sql } from 'drizzle-orm';
import {
  effectiveParticipantMemoryRetentionDays,
  type ParticipantMemoryRetention,
} from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import {
  participantMemoryAccess,
  participantMemoryConsents,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemorySettings,
  participantMemoryVehicles,
} from './participant-memory-schema.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Revoked consent rows are the only trace left; they follow the statutory limitation period. */
export const CONSENT_LOG_RETENTION_DAYS = 1095;

/**
 * Serializes everything that touches one participant's memory in one organization.
 * Participant work shares the organization lock; switching the feature off takes it
 * exclusively, so no capture can slip in behind a purge. Locks are advisory and
 * tenant-scoped, never table-wide.
 */
export const lockParticipant = async (
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${`nennbox.participant-memory.org:${organizationId}`}, 0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`nennbox.participant-memory:${organizationId}:${email}`}, 0))`,
  );
};
export const lockOrganization = (
  tx: TransactionDatabase,
  organizationId: string,
) =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`nennbox.participant-memory.org:${organizationId}`}, 0))`,
  );

export async function loadSettings(
  tx: TransactionDatabase,
  organizationId: string,
) {
  const [row] = await tx
    .select()
    .from(participantMemorySettings)
    .where(eq(participantMemorySettings.organizationId, organizationId));
  return row ?? null;
}
export async function memoryEnabled(
  tx: TransactionDatabase,
  organizationId: string,
) {
  return Boolean((await loadSettings(tx, organizationId))?.enabled);
}
export async function retentionCutoff(
  tx: TransactionDatabase,
  organizationId: string,
  bounds: ParticipantMemoryRetention,
  now = new Date(),
) {
  const settings = await loadSettings(tx, organizationId);
  const days = effectiveParticipantMemoryRetentionDays(
    settings?.retentionDays,
    bounds,
  );
  return new Date(now.getTime() - days * DAY_MS);
}
export async function activeConsent(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
) {
  const [row] = await tx
    .select()
    .from(participantMemoryConsents)
    .where(
      and(
        eq(participantMemoryConsents.organizationId, organizationId),
        eq(participantMemoryConsents.email, email),
        sql`${participantMemoryConsents.revokedAt} is null`,
      ),
    );
  return row ?? null;
}
export async function hasStoredData(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
) {
  for (const table of [
    participantMemoryProfiles,
    participantMemoryVehicles,
    participantMemoryPassengers,
    participantMemoryDocuments,
  ] as const) {
    const [row] = await tx
      .select({ one: sql<number>`1` })
      .from(table)
      .where(
        and(eq(table.organizationId, organizationId), eq(table.email, email)),
      )
      .limit(1);
    if (row) return true;
  }
  return false;
}
/** Deletes one participant's stored data in one organization; consent log and entries stay. */
export async function purgeParticipant(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
  options: { revokeSessions: boolean } = { revokeSessions: false },
) {
  let removed = 0;
  for (const table of [
    participantMemoryProfiles,
    participantMemoryVehicles,
    participantMemoryPassengers,
    participantMemoryDocuments,
  ] as const) {
    const rows = await tx
      .delete(table)
      .where(
        and(eq(table.organizationId, organizationId), eq(table.email, email)),
      )
      .returning({ email: table.email });
    removed += rows.length;
  }
  // Open links die with the data they would have opened; sessions only when asked.
  await tx
    .update(participantMemoryAccess)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(participantMemoryAccess.organizationId, organizationId),
        eq(participantMemoryAccess.email, email),
        sql`${participantMemoryAccess.revokedAt} is null`,
        options.revokeSessions
          ? sql`true`
          : sql`${participantMemoryAccess.purpose} <> 'session'`,
      ),
    );
  return removed;
}
export async function closeConsent(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
  reason: 'withdrawn' | 'deleted' | 'disabled' | 'expired',
) {
  await tx
    .update(participantMemoryConsents)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(participantMemoryConsents.organizationId, organizationId),
        eq(participantMemoryConsents.email, email),
        sql`${participantMemoryConsents.revokedAt} is null`,
      ),
    );
}
