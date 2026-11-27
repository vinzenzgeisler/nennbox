import { and, eq, sql } from 'drizzle-orm';
import type { RequestContext } from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import { entryHoldsClassSeat } from './entry-occupancy.js';
import { entryAuditEvents } from './schema/entry-audit.js';
import { entries } from './schema/entries.js';
import { eventClasses } from './schema/organization.js';
import {
  placeEntryOnWaitlist,
  waitlistStatusKey,
} from './registration-submit-waitlist.js';

/**
 * An entry that gave up its place (withdrawn or rejected) is active again. If
 * its class has filled up in the meantime it joins the waitlist at the tail
 * instead of overbooking. A full class without any waiting status in the
 * entry's workflow refuses with `class_full_no_waitlist`. Returns the new
 * waitlist status key when the entry was redirected.
 */
export async function seatOrWaitlistReactivated(
  tx: TransactionDatabase,
  ctx: RequestContext,
  entry: {
    id: string;
    eventId: string;
    classId: string;
    workflowRevisionId: string | null;
    acceptanceStatus: string;
  },
): Promise<string | null> {
  const [eventClass] = await tx
    .select({ max: eventClasses.maxParticipants })
    .from(eventClasses)
    .where(
      and(
        eq(eventClasses.organizationId, ctx.organizationId),
        eq(eventClasses.eventId, entry.eventId),
        eq(eventClasses.id, entry.classId),
      ),
    )
    .for('update');
  if (!eventClass || eventClass.max === null) return null;
  const [occupancy] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, entry.eventId),
        eq(entries.classId, entry.classId),
        sql`${entries.id} <> ${entry.id}`,
        sql`${entries.deletedAt} is null`,
        entryHoldsClassSeat(),
      ),
    );
  if (Number(occupancy?.count ?? 0) < eventClass.max) return null;
  if (!(await waitlistStatusKey(tx, ctx.organizationId, entry.id)))
    throw new Error('class_full_no_waitlist');
  await placeEntryOnWaitlist(tx, ctx, entry.eventId, entry.classId, entry.id);
  const [moved] = await tx
    .select({ status: entries.acceptanceStatus })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, entry.id),
      ),
    );
  await tx.insert(entryAuditEvents).values({
    organizationId: ctx.organizationId,
    entryId: entry.id,
    transition: 'acceptance',
    fromStatus: entry.acceptanceStatus,
    toStatus: moved!.status,
    actor: 'system',
    reason: 'class_full_reactivated_to_waitlist',
    workflowRevisionId: entry.workflowRevisionId!,
    statusCategory: 'waitlisted',
  });
  return moved!.status;
}
