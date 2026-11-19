import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestContext } from '@racepilot/core';
import { eventDriverPortalFields } from './schema/driver-portal.js';
import {
  registrationGroups,
  entries,
  people,
  vehicles,
} from './schema/entries.js';
import { events, eventClasses } from './schema/organization.js';
import { invoices, organizationPaymentRecipients } from './schema/billing.js';
import { eventEntryDocumentTypes, entryDocuments } from './schema/documents.js';
import { emailOutbox } from './mail-schema.js';
import type { Database } from './database.js';
import type { createDriverPortalAccess } from './driver-portal-access.js';
export function createDriverPortalView(
  db: Database,
  session: ReturnType<typeof createDriverPortalAccess>['session'],
) {
  return {
    async view(ctx: RequestContext, token: string) {
      const access = await session(ctx, token);
      if (!access) return null;
      const [event] = await db
        .select({
          name: events.name,
          startsOn: events.startsOn,
          endsOn: events.endsOn,
        })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, access.eventId),
          ),
        )
        .limit(1);
      if (!event) return null;
      const rows = await db
        .select({
          id: entries.id,
          driverFirstName: people.firstName,
          driverLastName: people.lastName,
          className: eventClasses.name,
          status: entries.acceptanceStatus,
          startNumber: entries.requestedStartNumber,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
        })
        .from(entries)
        .innerJoin(
          people,
          and(
            eq(people.organizationId, entries.organizationId),
            eq(people.id, entries.driverPersonId),
          ),
        )
        .innerJoin(
          eventClasses,
          and(
            eq(eventClasses.organizationId, entries.organizationId),
            eq(eventClasses.id, entries.classId),
          ),
        )
        .innerJoin(
          vehicles,
          and(
            eq(vehicles.organizationId, entries.organizationId),
            eq(vehicles.id, entries.vehicleId),
          ),
        )
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, access.eventId),
            eq(entries.registrationGroupId, access.groupId),
            isNull(entries.deletedAt),
          ),
        );
      const types = await db
        .select({
          key: eventEntryDocumentTypes.key,
          name: eventEntryDocumentTypes.name,
          required: eventEntryDocumentTypes.required,
        })
        .from(eventEntryDocumentTypes)
        .where(
          and(
            eq(eventEntryDocumentTypes.organizationId, ctx.organizationId),
            eq(eventEntryDocumentTypes.eventId, access.eventId),
            eq(eventEntryDocumentTypes.enabled, true),
          ),
        );
      const docs = rows.length
        ? await db
            .select({
              entryId: entryDocuments.entryId,
              typeKey: entryDocuments.typeKey,
              status: entryDocuments.status,
              rejectionReason: entryDocuments.rejectionReason,
              uploadedAt: entryDocuments.uploadedAt,
            })
            .from(entryDocuments)
            .where(
              and(
                eq(entryDocuments.organizationId, ctx.organizationId),
                inArray(
                  entryDocuments.entryId,
                  rows.map((r) => r.id),
                ),
              ),
            )
            .orderBy(sql`${entryDocuments.uploadedAt} desc`)
        : [];
      const messages = await db
        .select({
          subject: sql<string>`${emailOutbox.variables}->>'subject'`,
          body: sql<string>`${emailOutbox.variables}->>'body'`,
          sentAt: emailOutbox.sentAt,
        })
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.organizationId, ctx.organizationId),
            eq(emailOutbox.eventId, access.eventId),
            eq(emailOutbox.registrationGroupId, access.groupId),
            eq(emailOutbox.templateKey, 'message-campaign'),
            eq(emailOutbox.status, 'sent'),
          ),
        )
        .orderBy(sql`${emailOutbox.sentAt} desc`)
        .limit(30);
      const [invoice] = await db
        .select({
          invoiceId: invoices.id,
          status: invoices.status,
          totalCents: invoices.totalCents,
          paidCents: sql<number>`coalesce((select sum(p.amount_cents) from invoice_payment p where p.organization_id = ${invoices.organizationId} and p.invoice_id = ${invoices.id}), 0)::int`,
          currency: invoices.currency,
          paymentReference: invoices.paymentReference,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.registrationGroupId, access.groupId),
          ),
        )
        .limit(1);
      const [recipient] = await db
        .select({
          accountName: organizationPaymentRecipients.accountName,
          iban: organizationPaymentRecipients.iban,
          bic: organizationPaymentRecipients.bic,
        })
        .from(organizationPaymentRecipients)
        .where(
          eq(organizationPaymentRecipients.organizationId, ctx.organizationId),
        )
        .limit(1);
      const fields = await db
        .select({ key: eventDriverPortalFields.fieldKey })
        .from(eventDriverPortalFields)
        .where(
          and(
            eq(eventDriverPortalFields.organizationId, ctx.organizationId),
            eq(eventDriverPortalFields.eventId, access.eventId),
          ),
        );
      const [group] = await db
        .select({
          phone: registrationGroups.phone,
          street: registrationGroups.street,
          postalCode: registrationGroups.postalCode,
          city: registrationGroups.city,
          emergencyContactName: registrationGroups.emergencyContactName,
          emergencyContactPhone: registrationGroups.emergencyContactPhone,
          licenseNumber: registrationGroups.licenseNumber,
        })
        .from(registrationGroups)
        .where(
          and(
            eq(registrationGroups.organizationId, ctx.organizationId),
            eq(registrationGroups.id, access.groupId),
          ),
        )
        .limit(1);
      return {
        eventName: event.name,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        entries: rows.map((row) => ({
          id: row.id,
          driverName: `${row.driverFirstName} ${row.driverLastName}`,
          className: row.className,
          status: row.status,
          startNumber: row.startNumber,
          vehicle: `${row.vehicleMake} ${row.vehicleModel}`,
          documents: types.map((type) => {
            const doc = docs.find(
              (d) => d.entryId === row.id && d.typeKey === type.key,
            );
            return {
              ...type,
              status: doc?.status ?? 'missing',
              rejectionReason: doc?.rejectionReason ?? null,
            };
          }),
        })),
        messages: messages.map((m) => ({
          subject: m.subject,
          body: m.body,
          sentAt: m.sentAt?.toISOString() ?? null,
        })),
        payment: invoice
          ? {
              ...invoice,
              paidCents: Number(invoice.paidCents),
              accountName: recipient?.accountName ?? null,
              iban: recipient?.iban ?? null,
              bic: recipient?.bic ?? null,
            }
          : null,
        editableFields: fields.map((f) => f.key),
        contact: group,
      };
    },
  };
}
