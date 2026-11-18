import { and, eq, sql } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import type { TransactionDatabase } from './database.js';
import { entries } from './schema/entries.js';

export async function placeEntryOnWaitlist(
  tx: TransactionDatabase,
  ctx: RequestContext,
  eventId: string,
  classId: string,
  entryId: string,
  currentPosition?: number,
): Promise<number> {
  let position = currentPosition;
  if (position === undefined) {
    const result = await tx.execute<{ next_position: number }>(
      sql`select coalesce(max(waitlist_position), 0)::int + 1 as next_position from entry where organization_id = ${ctx.organizationId} and event_id = ${eventId} and class_id = ${classId} and acceptance_status = 'waitlisted' and deleted_at is null`,
    );
    position = Number(result.rows[0]?.next_position ?? 1);
  }
  await tx
    .update(entries)
    .set({ acceptanceStatus: 'waitlisted', waitlistPosition: position })
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, entryId),
      ),
    );
  return position + 1;
}
