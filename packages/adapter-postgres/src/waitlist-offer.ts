import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import {
  confirmationDeadline,
  organizationId as brandOrganizationId,
  type RequestContext,
} from '@racepilot/core';
import type { TransactionDatabase } from './database.js';
import { entries, people, registrationGroups } from './schema/entries.js';
import { eventClasses, events, organizations } from './schema/organization.js';
import { eventWaitlistSettings } from './schema/start-numbers.js';
import { enqueueMailOutbox } from './mail-outbox.js';

export async function offerWaitlistSeat(args: {
  tx: TransactionDatabase;
  ctx: RequestContext;
  eventId: string;
  classId: string;
  now?: Date;
  automatic?: boolean;
}): Promise<{ entryId: string; position: number; deadline: Date } | null> {
  const { tx, ctx, eventId, classId, automatic = true } = args;
  const now = args.now ?? new Date();
  const [eventClass] = await tx
    .select()
    .from(eventClasses)
    .where(
      and(
        eq(eventClasses.organizationId, ctx.organizationId),
        eq(eventClasses.eventId, eventId),
        eq(eventClasses.id, classId),
      ),
    )
    .for('update')
    .limit(1);
  if (!eventClass) return null;
  const [settings] = await tx
    .select()
    .from(eventWaitlistSettings)
    .where(
      and(
        eq(eventWaitlistSettings.organizationId, ctx.organizationId),
        eq(eventWaitlistSettings.eventId, eventId),
      ),
    )
    .limit(1);
  if (automatic && !settings?.automaticPromotion) return null;
  const [occupancy] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        eq(entries.classId, classId),
        isNull(entries.deletedAt),
        notInArray(entries.acceptanceStatus, ['withdrawn', 'waitlisted']),
      ),
    );
  const [activeOffers] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        eq(entries.classId, classId),
        eq(entries.acceptanceStatus, 'waitlisted'),
        isNull(entries.deletedAt),
        sql`${entries.waitlistConfirmationDeadline} > ${now}`,
      ),
    );
  if (
    eventClass.maxParticipants !== null &&
    Number(occupancy?.count ?? 0) + Number(activeOffers?.count ?? 0) >=
      eventClass.maxParticipants
  )
    return null;
  const [next] = await tx
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        eq(entries.classId, classId),
        eq(entries.acceptanceStatus, 'waitlisted'),
        isNull(entries.deletedAt),
        isNull(entries.waitlistOfferSentAt),
      ),
    )
    .orderBy(
      asc(entries.waitlistPosition),
      asc(entries.createdAt),
      asc(entries.id),
    )
    .for('update')
    .limit(1);
  if (!next) return null;
  const deadline = confirmationDeadline(now, settings?.confirmationHours ?? 48);
  await tx
    .update(entries)
    .set({ waitlistOfferSentAt: now, waitlistConfirmationDeadline: deadline })
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, next.id),
      ),
    );
  const [recipient] = await tx
    .select({
      email: sql<
        string | null
      >`coalesce(${registrationGroups.contactEmail}, ${people.email})`,
      name: sql<string>`concat_ws(' ', ${people.firstName}, ${people.lastName})`,
      eventName: events.name,
      locale: organizations.locale,
    })
    .from(entries)
    .innerJoin(
      events,
      and(
        eq(events.organizationId, entries.organizationId),
        eq(events.id, entries.eventId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, entries.organizationId))
    .innerJoin(
      people,
      and(
        eq(people.organizationId, entries.organizationId),
        eq(people.id, entries.driverPersonId),
      ),
    )
    .innerJoin(
      registrationGroups,
      and(
        eq(registrationGroups.organizationId, entries.organizationId),
        eq(registrationGroups.id, entries.registrationGroupId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.id, next.id),
      ),
    )
    .limit(1);
  if (recipient?.email)
    await enqueueMailOutbox(
      tx as never,
      ctx.organizationId,
      {
        eventId,
        registrationGroupId: next.registrationGroupId,
        templateKey: 'status-change',
        templateVersion: 1,
        locale: recipient.locale === 'en' ? 'en' : 'de',
        recipient: recipient.email,
        idempotencyKey: `waitlist-offer:${next.id}:${deadline.toISOString()}`,
        correlationId: ctx.correlationId,
        variables: {
          recipientName: recipient.name,
          eventName: recipient.eventName,
          orgaCode: next.orgaCode,
          statusKey: 'waitlist-offer',
          statusLabelDe: 'Ein Startplatz ist frei geworden',
          statusLabelEn: 'A place has become available',
          driverNote: `Bitte melden Sie sich bis ${deadline.toLocaleString('de-DE')} zur Bestätigung. Wartelistenposition: ${next.waitlistPosition ?? '—'}.`,
        },
      },
      tx as never,
    );
  return { entryId: next.id, position: next.waitlistPosition ?? 0, deadline };
}

export async function advanceExpiredWaitlistOffers(
  db: import('./database.js').Database,
  organizationId: string,
  now = new Date(),
): Promise<number> {
  const due = await db
    .select({ eventId: entries.eventId, classId: entries.classId })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, organizationId),
        eq(entries.acceptanceStatus, 'waitlisted'),
        sql`${entries.waitlistConfirmationDeadline} <= ${now}`,
        sql`${entries.waitlistConfirmationDeadline} is not null`,
        isNull(entries.deletedAt),
      ),
    );
  const groups = [
    ...new Map(
      due.map((row) => [`${row.eventId}:${row.classId}`, row]),
    ).values(),
  ];
  let advanced = 0;
  for (const group of groups) {
    await db.transaction(async (tx) => {
      const [eventClass] = await tx
        .select()
        .from(eventClasses)
        .where(
          and(
            eq(eventClasses.organizationId, organizationId),
            eq(eventClasses.eventId, group.eventId),
            eq(eventClasses.id, group.classId),
          ),
        )
        .for('update')
        .limit(1);
      if (!eventClass) return;
      const expired = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, organizationId),
            eq(entries.eventId, group.eventId),
            eq(entries.classId, group.classId),
            eq(entries.acceptanceStatus, 'waitlisted'),
            sql`${entries.waitlistConfirmationDeadline} <= ${now}`,
            isNull(entries.deletedAt),
          ),
        )
        .orderBy(asc(entries.waitlistPosition), asc(entries.id));
      const [tail] = await tx
        .select({
          position: sql<number>`coalesce(max(${entries.waitlistPosition}), 0)::int`,
        })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, organizationId),
            eq(entries.eventId, group.eventId),
            eq(entries.classId, group.classId),
            eq(entries.acceptanceStatus, 'waitlisted'),
            isNull(entries.deletedAt),
          ),
        );
      let nextPosition = Number(tail?.position ?? 0) + 1;
      for (const expiredEntry of expired) {
        await tx
          .update(entries)
          .set({
            waitlistPosition: nextPosition++,
            waitlistConfirmationDeadline: null,
          })
          .where(
            and(
              eq(entries.organizationId, organizationId),
              eq(entries.id, expiredEntry.id),
            ),
          );
      }
      const context = {
        organizationId: brandOrganizationId(organizationId),
        correlationId: `waitlist-deadline:${group.eventId}:${group.classId}`,
        deploymentMode: 'community' as const,
        permissions: new Set<string>(),
        capabilities: new Set<string>(),
      };
      const offer = await offerWaitlistSeat({
        tx,
        ctx: context,
        eventId: group.eventId,
        classId: group.classId,
        now,
        automatic: true,
      });
      if (offer) advanced += 1;
    });
  }
  return advanced;
}
