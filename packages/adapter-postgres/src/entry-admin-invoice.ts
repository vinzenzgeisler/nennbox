import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AdminEntryInvoice, RequestContext } from '@nennbox/core';
import type { Database } from './database.js';
import { invoices } from './schema/billing.js';

/** Invoice and paid amount per registration group; one invoice can cover several entries. */
export async function loadInvoiceSummaries(
  db: Pick<Database, 'select'>,
  ctx: RequestContext,
  groupIds: string[],
): Promise<Map<string, AdminEntryInvoice>> {
  const rows = await db
    .select({
      groupId: invoices.registrationGroupId,
      id: invoices.id,
      paymentReference: invoices.paymentReference,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      status: invoices.status,
      paidAt: invoices.paidAt,
      paidCents: sql<number>`coalesce((select sum(p.amount_cents) from invoice_payment p where p.organization_id = invoice.organization_id and p.invoice_id = invoice.id), 0)::int`,
      providerPayments: sql<
        AdminEntryInvoice['providerPayments']
      >`coalesce((select jsonb_agg(jsonb_build_object('providerPaymentId', refundable.provider_payment_id, 'refundableCents', refundable.refundable_cents)) from (select p.provider_payment_id, sum(p.amount_cents)::int as refundable_cents from invoice_payment p where p.organization_id = invoice.organization_id and p.invoice_id = invoice.id and p.provider_payment_id is not null group by p.provider_payment_id having sum(p.amount_cents) > 0) refundable), '[]'::jsonb)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, ctx.organizationId),
        inArray(invoices.registrationGroupId, groupIds),
      ),
    );
  return new Map(
    rows.map(({ groupId, ...invoice }) => [
      groupId,
      {
        ...invoice,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        status: invoice.status as AdminEntryInvoice['status'],
      },
    ]),
  );
}
