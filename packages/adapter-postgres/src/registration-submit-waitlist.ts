import { and, eq, sql } from 'drizzle-orm';
import { RegistrationUnavailable, type RequestContext } from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import { entries } from './schema/entries.js';

/**
 * Status a waiting entry gets: the first `waitlisted` status of its own pinned
 * revision, in workflow order. Null when that workflow has no waiting status.
 */
export async function waitlistStatusKey(
  tx: TransactionDatabase,
  organizationId: string,
  entryId: string,
): Promise<string | null> {
  const result = await tx.execute<{ key: string }>(
    sql`select coalesce(s.value->>'id', s.value->>'key') as key
      from entry e
      join entry_workflow_revision r on r.organization_id = e.organization_id and r.id = e.workflow_revision_id
      cross join lateral jsonb_array_elements(r.workflow->'statuses') with ordinality s(value, position)
      where e.organization_id = ${organizationId} and e.id = ${entryId} and s.value->>'category' = 'waitlisted'
      order by s.position limit 1`,
  );
  return result.rows[0]?.key ?? null;
}

/**
 * Returns the next free waitlist position. A class that is full while its
 * workflow has no waiting status cannot take the entry: refuse with a named
 * reason instead of writing a NULL status.
 */
export async function placeEntryOnWaitlist(
  tx: TransactionDatabase,
  ctx: RequestContext,
  eventId: string,
  classId: string,
  entryId: string,
  currentPosition?: number,
): Promise<number> {
  const statusKey = await waitlistStatusKey(tx, ctx.organizationId, entryId);
  if (!statusKey) throw new RegistrationUnavailable('waitlist-unavailable');
  let position = currentPosition;
  if (position === undefined) {
    const result = await tx.execute<{ next_position: number }>(
      sql`select coalesce(max(waitlist_position), 0)::int + 1 as next_position from entry where organization_id = ${ctx.organizationId} and event_id = ${eventId} and class_id = ${classId} and entry_status_category(organization_id, workflow_revision_id, acceptance_status) = 'waitlisted' and deleted_at is null`,
    );
    position = Number(result.rows[0]?.next_position ?? 1);
  }
  await tx
    .update(entries)
    .set({
      acceptanceStatus: statusKey,
      waitlistPosition: position,
      waitlistOfferSentAt: null,
      waitlistConfirmationDeadline: null,
    })
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, entryId),
      ),
    );
  return position + 1;
}
