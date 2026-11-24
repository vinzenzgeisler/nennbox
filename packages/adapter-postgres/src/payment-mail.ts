import { and, eq, sql } from 'drizzle-orm';
import type { PaymentProviderEvent } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import { invoices } from './schema/billing.js';
import { events, organizations } from './schema/organization.js';
import { people, registrationGroups } from './schema/entries.js';

export function formatMailAmount(
  cents: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** Who gets the payment mails of an invoice, and what they are told about the event. */
export async function loadInvoiceMailRecipient(
  tx: Pick<TransactionDatabase, 'select'>,
  organizationId: string,
  invoiceId: string,
) {
  const [row] = await tx
    .select({
      eventId: events.id,
      eventName: events.name,
      eventSlug: events.slug,
      groupId: registrationGroups.id,
      email: sql<
        string | null
      >`coalesce(${registrationGroups.contactEmail}, ${people.email})`,
      recipientName: sql<string>`concat_ws(' ', ${people.firstName}, ${people.lastName})`,
      locale: organizations.locale,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      paymentReference: invoices.paymentReference,
      paidCents: sql<number>`coalesce((select sum(p.amount_cents) from invoice_payment p where p.organization_id = invoice.organization_id and p.invoice_id = invoice.id), 0)::int`,
    })
    .from(invoices)
    .innerJoin(
      registrationGroups,
      and(
        eq(registrationGroups.organizationId, invoices.organizationId),
        eq(registrationGroups.id, invoices.registrationGroupId),
      ),
    )
    .innerJoin(
      people,
      and(
        eq(people.organizationId, registrationGroups.organizationId),
        eq(people.id, registrationGroups.personId),
      ),
    )
    .innerJoin(
      events,
      and(
        eq(events.organizationId, invoices.organizationId),
        eq(events.id, invoices.eventId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, invoices.organizationId))
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.id, invoiceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

const portalPath = (slug: string) =>
  `/events/${encodeURIComponent(slug)}/my-entry`;

/** Payment confirmation for the payer; the outbox key keeps a replayed event from mailing twice. */
export async function queuePaymentReceivedMail(
  db: Database,
  tx: TransactionDatabase,
  event: Extract<PaymentProviderEvent, { type: 'succeeded' }>,
): Promise<void> {
  const recipient = await loadInvoiceMailRecipient(
    tx,
    event.organizationId,
    event.invoiceId,
  );
  if (!recipient?.email) return;
  const locale = recipient.locale === 'en' ? 'en' : 'de';
  await enqueueMailOutbox(
    db,
    event.organizationId,
    {
      eventId: recipient.eventId,
      registrationGroupId: recipient.groupId,
      templateKey: 'payment-received',
      templateVersion: 1,
      locale,
      recipient: recipient.email,
      idempotencyKey: `payment-received:${event.id}`,
      variables: {
        recipientName: recipient.recipientName,
        eventName: recipient.eventName,
        amount: formatMailAmount(event.amountCents, event.currency, locale),
        paymentReference: recipient.paymentReference,
        portalUrl: portalPath(recipient.eventSlug),
      },
    },
    tx,
  );
}

/** Confirmation of a verified registration, with the payment state and the link to pay later. */
export async function queueEntryReceivedMail(
  db: Database,
  tx: TransactionDatabase,
  args: { organizationId: string; invoiceId: string; correlationKey: string },
): Promise<void> {
  const recipient = await loadInvoiceMailRecipient(
    tx,
    args.organizationId,
    args.invoiceId,
  );
  if (!recipient?.email) return;
  const locale = recipient.locale === 'en' ? 'en' : 'de';
  const open = Math.max(0, recipient.totalCents - recipient.paidCents);
  const de = locale === 'de';
  const paymentSummary =
    recipient.totalCents === 0 || open === 0
      ? de
        ? 'Die Startgebühr ist bezahlt.'
        : 'Your entry fee is paid.'
      : de
        ? `Offener Betrag: ${formatMailAmount(open, recipient.currency, locale)} (Verwendungszweck ${recipient.paymentReference}). Über den Link kannst du jederzeit online bezahlen.`
        : `Amount due: ${formatMailAmount(open, recipient.currency, locale)} (payment reference ${recipient.paymentReference}). You can pay online at any time using the link.`;
  await enqueueMailOutbox(
    db,
    args.organizationId,
    {
      eventId: recipient.eventId,
      registrationGroupId: recipient.groupId,
      templateKey: 'entry-received',
      templateVersion: 1,
      locale,
      recipient: recipient.email,
      idempotencyKey: `entry-received:${args.correlationKey}`,
      variables: {
        recipientName: recipient.recipientName,
        eventName: recipient.eventName,
        paymentSummary,
        portalUrl: portalPath(recipient.eventSlug),
      },
    },
    tx,
  );
}
