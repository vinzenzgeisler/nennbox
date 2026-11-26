import { people, registrationGroups, entries } from './schema/entries.js';
import { entryAuditEvents } from './schema/entry-audit.js';
import { eq, and, desc } from 'drizzle-orm';
import { entryNotes } from './schema/entry-admin.js';
import { sql } from 'drizzle-orm';
import { organizations, events } from './schema/organization.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import { projectEntryRows } from './entry-projection.js';
import type { Database } from './database.js';
import type { EntryRepository } from '@nennbox/core';
import { attachAdminEntryDetails } from './entry-admin-details.js';
import { offerWaitlistSeat } from './waitlist-offer.js';
import {
  guardRefundTransition,
  invalidateReactivatedRefunds,
} from './refund-transition.js';
import { openRefundIntent } from './payment-refund-intents.js';
import { assertReadyAdmission } from './workbasket-admission.js';
import { workbasketTransaction } from './workbasket-transaction.js';
import { retryOnConflict } from './transaction-retry.js';

export function createEntryTransitionMethod(
  db: Database,
): Required<Pick<EntryRepository, 'transition'>> {
  return {
    transition: async (
      ctx,
      id,
      transition,
      fromStatus,
      toStatus,
      actor,
      reason,
      workflow,
      readiness,
    ) =>
      retryOnConflict(() =>
        workbasketTransaction(db, !!readiness, async (tx) => {
          if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');
          if (readiness)
            await assertReadyAdmission(
              tx,
              ctx,
              id,
              readiness.eventId,
              workflow,
            );
          if (transition === 'acceptance')
            await guardRefundTransition(
              tx,
              ctx.organizationId,
              id,
              toStatus,
              workflow?.statusCategory,
            );
          const statusColumn =
            transition === 'verification'
              ? entries.verificationStatus
              : entries.acceptanceStatus;
          const [row] = await tx
            .update(entries)
            .set({
              [transition === 'verification'
                ? 'verificationStatus'
                : 'acceptanceStatus']: toStatus,
            })
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.id, id),
                eq(statusColumn, fromStatus),
                ...(readiness && workflow
                  ? [
                      eq(
                        entries.workflowRevisionId,
                        workflow.workflowRevisionId,
                      ),
                    ]
                  : []),
                sql`${entries.deletedAt} is null`,
              ),
            )
            .returning();
          if (!row) return null;
          await tx.insert(entryAuditEvents).values({
            organizationId: ctx.organizationId,
            entryId: id,
            transition,
            fromStatus,
            toStatus,
            actor,
            reason,
            workflowRevisionId:
              workflow?.workflowRevisionId ?? row.workflowRevisionId!,
            ...(workflow ? { statusCategory: workflow.statusCategory } : {}),
          });
          if (
            transition === 'acceptance' &&
            (toStatus === 'withdrawn' ||
              toStatus === 'rejected' ||
              workflow?.statusCategory === 'withdrawn' ||
              workflow?.statusCategory === 'rejected')
          ) {
            await offerWaitlistSeat({
              tx,
              ctx,
              eventId: row.eventId,
              classId: row.classId,
              automatic: true,
            });
            await openRefundIntent(
              tx,
              ctx.organizationId,
              id,
              toStatus === 'withdrawn' ||
                workflow?.statusCategory === 'withdrawn'
                ? 'withdrawn'
                : 'rejected',
            );
          }
          if (transition === 'acceptance')
            await invalidateReactivatedRefunds(tx, ctx.organizationId, id);
          if (transition === 'acceptance' && workflow?.notification) {
            const [recipient] = await tx
              .select({
                email: sql<
                  string | null
                >`coalesce(${registrationGroups.contactEmail}, ${people.email})`,
                recipientName: sql<string>`concat_ws(' ', ${people.firstName}, ${people.lastName})`,
                eventName: events.name,
                orgaCode: entries.orgaCode,
                locale: organizations.locale,
              })
              .from(entries)
              .innerJoin(
                events,
                and(
                  eq(events.id, entries.eventId),
                  eq(events.organizationId, entries.organizationId),
                ),
              )
              .innerJoin(
                organizations,
                eq(organizations.id, entries.organizationId),
              )
              .innerJoin(
                people,
                and(
                  eq(people.id, entries.driverPersonId),
                  eq(people.organizationId, entries.organizationId),
                ),
              )
              .innerJoin(
                registrationGroups,
                and(
                  eq(registrationGroups.id, entries.registrationGroupId),
                  eq(registrationGroups.organizationId, entries.organizationId),
                ),
              )
              .where(
                and(
                  eq(entries.organizationId, ctx.organizationId),
                  eq(entries.id, id),
                ),
              )
              .limit(1);
            if (recipient?.email) {
              const [driverNote] = await tx
                .select({ body: entryNotes.body })
                .from(entryNotes)
                .where(
                  and(
                    eq(entryNotes.organizationId, ctx.organizationId),
                    eq(entryNotes.entryId, id),
                    eq(entryNotes.visibility, 'driver'),
                  ),
                )
                .orderBy(desc(entryNotes.createdAt))
                .limit(1);
              await enqueueMailOutbox(
                db,
                ctx.organizationId,
                {
                  eventId: row.eventId,
                  registrationGroupId: row.registrationGroupId,
                  templateKey: 'status-change',
                  templateVersion: 1,
                  locale: recipient.locale === 'en' ? 'en' : 'de',
                  recipient: recipient.email,
                  idempotencyKey: `entry-status:${id}:${workflow.workflowRevisionId}:${fromStatus}:${toStatus}`,
                  correlationId: ctx.correlationId,
                  variables: {
                    recipientName: recipient.recipientName,
                    eventName: recipient.eventName,
                    orgaCode: recipient.orgaCode,
                    statusKey: workflow.notification.statusKey,
                    statusLabelDe: workflow.notification.statusLabelDe,
                    statusLabelEn: workflow.notification.statusLabelEn,
                    driverNote: driverNote?.body ?? '',
                  },
                },
                tx,
              );
            }
          }
          // Return the same read model as entry detail, including the audit just written.
          const projected = await projectEntryRows(tx, ctx, [row]);
          return (await attachAdminEntryDetails(tx, ctx, projected))[0] ?? null;
        }),
      ),
  };
}
