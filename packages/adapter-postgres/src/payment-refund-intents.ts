import { and, eq, sql } from 'drizzle-orm';
import type {
  ClaimedRefundIntent,
  RefundIntentRepository,
  RefundTrigger,
} from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { events } from './schema/organization.js';
import { entries } from './schema/entries.js';
import { invoices } from './schema/billing.js';
import { paymentRefundIntents } from './schema/provider-payments.js';
import { loadPaymentSettings } from './payment-settings.js';

const rows = <T>(result: unknown) => (result as { rows: T[] }).rows;

/**
 * Called inside the transaction that cancels an entry. Records that a refund
 * is due, but only when the whole registration group is cancelled (the invoice
 * covers the group) and an online payment exists to give back. The provider is
 * called later, outside this transaction.
 */
export async function openRefundIntent(
  tx: TransactionDatabase,
  organizationId: string,
  entryId: string,
  trigger: RefundTrigger,
): Promise<void> {
  const [entry] = await tx
    .select({ groupId: entries.registrationGroupId })
    .from(entries)
    .where(
      and(eq(entries.organizationId, organizationId), eq(entries.id, entryId)),
    )
    .limit(1);
  if (!entry) return;
  const [invoice] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.registrationGroupId, entry.groupId),
      ),
    )
    .limit(1);
  if (!invoice) return;
  const [state] = rows<{ active: number; refundable: number }>(
    await tx.execute(sql`
      select
        (select count(*)::int from entry e
          left join entry_workflow_revision r on r.organization_id = e.organization_id and r.id = e.workflow_revision_id
          where e.organization_id = ${organizationId}
            and e.registration_group_id = ${entry.groupId}
            and e.deleted_at is null
            and not (e.acceptance_status in ('withdrawn', 'rejected') or exists (
              select 1 from jsonb_array_elements(coalesce(r.workflow->'statuses', '[]'::jsonb)) s
              where (s->>'id' = e.acceptance_status or s->>'key' = e.acceptance_status)
                and s->>'category' in ('withdrawn', 'rejected')))) as active,
        (select coalesce(sum(refundable), 0)::int from (
          select sum(p.amount_cents) as refundable from invoice_payment p
          where p.organization_id = ${organizationId} and p.invoice_id = ${invoice.id}
            and p.provider_payment_id is not null
          group by p.provider_payment_id having sum(p.amount_cents) > 0) x) as refundable`),
  );
  if (!state || Number(state.active) > 0 || Number(state.refundable) <= 0)
    return;
  await tx
    .insert(paymentRefundIntents)
    .values({
      organizationId,
      invoiceId: invoice.id,
      entryId,
      trigger,
    })
    .onConflictDoNothing();
}

export function createRefundIntentRepository(
  db: Database,
): RefundIntentRepository {
  return {
    openInvoiceForEntry: async (ctx, entryId) => {
      const [intent] = await db
        .select({ invoiceId: paymentRefundIntents.invoiceId })
        .from(paymentRefundIntents)
        .where(
          and(
            eq(paymentRefundIntents.organizationId, ctx.organizationId),
            eq(paymentRefundIntents.entryId, entryId),
            eq(paymentRefundIntents.status, 'pending'),
          ),
        )
        .limit(1);
      return intent?.invoiceId ?? null;
    },
    claim: async (ctx, invoiceId): Promise<ClaimedRefundIntent | null> => {
      const [intent] = await db
        .select()
        .from(paymentRefundIntents)
        .where(
          and(
            eq(paymentRefundIntents.organizationId, ctx.organizationId),
            eq(paymentRefundIntents.invoiceId, invoiceId),
            eq(paymentRefundIntents.status, 'pending'),
          ),
        )
        .limit(1);
      if (!intent) return null;
      const [invoice] = await db
        .select({ eventId: invoices.eventId, currency: invoices.currency })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.id, invoiceId),
          ),
        )
        .limit(1);
      if (!invoice) return null;
      const [event] = await db
        .select({ startsOn: events.startsOn })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, invoice.eventId),
          ),
        )
        .limit(1);
      const settings = await loadPaymentSettings(
        db,
        ctx.organizationId,
        invoice.eventId,
      );
      const payments = rows<{ id: string; cents: number }>(
        await db.execute(sql`
          select p.provider_payment_id as id, sum(p.amount_cents)::int as cents
          from invoice_payment p
          where p.organization_id = ${ctx.organizationId} and p.invoice_id = ${invoiceId}
            and p.provider_payment_id is not null
          group by p.provider_payment_id having sum(p.amount_cents) > 0`),
      );
      if (!event || !settings) return null;
      return {
        id: intent.id,
        invoiceId,
        trigger: intent.trigger as RefundTrigger,
        cancelledAt: intent.cancelledAt,
        eventStartsOn: String(event.startsOn),
        policy: settings.refundPolicy,
        payments: payments.map((payment) => ({
          invoiceId,
          providerPaymentId: payment.id,
          refundableCents: Number(payment.cents),
          currency: invoice.currency,
        })),
      };
    },
    finish: async (ctx, intentId, result) => {
      await db
        .update(paymentRefundIntents)
        .set({
          status: result.status,
          percent: result.percent,
          refundedCents: result.refundedCents,
          failure: result.failure,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRefundIntents.organizationId, ctx.organizationId),
            eq(paymentRefundIntents.id, intentId),
          ),
        );
    },
  };
}
