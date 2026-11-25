import { sql } from 'drizzle-orm';
import { WorkbasketConcurrencyError } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';

function retryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; cause?: unknown };
  return (
    value.code === '40001' || value.code === '40P01' || retryable(value.cause)
  );
}

/**
 * Retry the whole transaction, never individual statements. Callbacks may only
 * persist transactional effects (including outbox/jobs), never send mail.
 */
export async function workbasketTransaction<T>(
  db: Database,
  authoritative: boolean,
  work: (tx: TransactionDatabase) => Promise<T>,
): Promise<T> {
  if (!authoritative) return db.transaction(work);
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(work, { isolationLevel: 'serializable' });
    } catch (error) {
      if (!retryable(error)) throw error;
      if (attempt === 2) throw new WorkbasketConcurrencyError(error);
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

/** Lock existing groups in stable order, limited to this tenant and event.
 * Prevent recipient address updates and invoice FK inserts during enqueue.
 * Absent rows/predicate changes are handled by the serializable snapshot.
 */
export async function lockCampaignGroups(
  tx: TransactionDatabase,
  organizationId: string,
  eventId: string,
) {
  await tx.execute(sql`SELECT id FROM registration_group
    WHERE organization_id=${organizationId} AND event_id=${eventId}
    ORDER BY id FOR UPDATE`);
}
