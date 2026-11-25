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
import { countActiveEntries } from './entry-group-activity.js';

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
  // Lock the invoice first: two cancellations of the last two entries run in
  // separate transactions and each must see the other's committed status, or
  // both count the other as still active and no refund is queued at all.
  const [invoice] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.registrationGroupId, entry.groupId),
      ),
    )
    .for('update')
    .limit(1);
  if (!invoice) return;
  const [running] = rows<{ id: string }>(
    await tx.execute(
      sql`select id from payment_refund_reservation where organization_id = ${organizationId} and invoice_id = ${invoice.id} and status = 'reserved' and source = 'automatic' limit 1`,
    ),
  );
  if (running) return;
  const active = await countActiveEntries(tx, organizationId, entry.groupId);
  const [state] = rows<{ refundable: number }>(
    await tx.execute(sql`
      select (select coalesce(sum(refundable), 0)::int from (
          select sum(p.amount_cents) as refundable from invoice_payment p
          where p.organization_id = ${organizationId} and p.invoice_id = ${invoice.id}
            and p.provider_payment_id is not null
          group by p.provider_payment_id having sum(p.amount_cents) > 0) x) as refundable`),
  );
  if (active > 0 || !state || Number(state.refundable) <= 0) return;
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

async function invoiceOfEntry(
  db: Pick<Database, 'select'>,
  organizationId: string,
  entryId: string,
): Promise<{ invoiceId: string; groupId: string } | null> {
  const [row] = await db
    .select({ invoiceId: invoices.id, groupId: entries.registrationGroupId })
    .from(entries)
    .innerJoin(
      invoices,
      and(
        eq(invoices.organizationId, entries.organizationId),
        eq(invoices.registrationGroupId, entries.registrationGroupId),
      ),
    )
    .where(
      and(eq(entries.organizationId, organizationId), eq(entries.id, entryId)),
    )
    .limit(1);
  return row ?? null;
}

export const DEFAULT_REFUND_RETRY_AFTER_MS = 10 * 60_000;

export function createRefundIntentRepository(
  db: Database,
  options: { retryAfterMs?: number } = {},
): RefundIntentRepository {
  const retryAfterSeconds = Math.max(
    1,
    Math.round((options.retryAfterMs ?? DEFAULT_REFUND_RETRY_AFTER_MS) / 1000),
  );
  return {
    cancelledInvoiceForEntry: async (ctx, entryId) => {
      const target = await invoiceOfEntry(db, ctx.organizationId, entryId);
      if (!target) return null;
      const active = await countActiveEntries(
        db,
        ctx.organizationId,
        target.groupId,
      );
      return active === 0 ? target.invoiceId : null;
    },
    closeIfReactivated: async (ctx, entryId) => {
      await db.transaction(async (tx) => {
        const target = await invoiceOfEntry(tx, ctx.organizationId, entryId);
        if (!target) return;
        // Same lock as the refund reservation: either this commits first and the
        // reservation sees the closed intent, or the reservation was made first.
        await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, target.invoiceId),
            ),
          )
          .for('update');
        if (
          (await countActiveEntries(tx, ctx.organizationId, target.groupId)) ===
          0
        )
          return;
        await tx
          .update(paymentRefundIntents)
          .set({
            status: 'skipped',
            failure: 'registration_reactivated',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentRefundIntents.organizationId, ctx.organizationId),
              eq(paymentRefundIntents.invoiceId, target.invoiceId),
              eq(paymentRefundIntents.status, 'pending'),
            ),
          );
      });
    },
    staleInvoiceIds: async (ctx) =>
      rows<{ invoice_id: string }>(
        await db.execute(sql`
          select invoice_id from payment_refund_intent
          where organization_id = ${ctx.organizationId}
            and ((status = 'pending' and created_at < now() - make_interval(secs => ${retryAfterSeconds}))
              or (status = 'processing' and claimed_at < now() - make_interval(secs => ${retryAfterSeconds}))
              or (status = 'failed' and updated_at < now() - make_interval(secs => ${retryAfterSeconds}) and exists (select 1 from payment_refund_reservation r where r.organization_id = payment_refund_intent.organization_id and r.intent_id = payment_refund_intent.id and r.status = 'reserved' and (r.needs_review_at is null or r.execution_uncertain or r.execution_token is not null))))
          and trigger <> 'late_payment'
          order by created_at limit 50`),
      ).map((row) => row.invoice_id),
    claim: async (ctx, invoiceId): Promise<ClaimedRefundIntent | null> => {
      // One atomic step: only one caller gets the intent. A "processing" intent
      // whose holder vanished (crash, timeout) becomes claimable again after the retry delay.
      const [intent] = rows<{
        id: string;
        trigger: string;
        cancelled_at: Date;
      }>(
        await db.execute(sql`
          update payment_refund_intent set status = 'processing', claimed_at = now(), updated_at = now()
          where id = (
            select id from payment_refund_intent
            where organization_id = ${ctx.organizationId} and invoice_id = ${invoiceId}
              and trigger <> 'late_payment'
              and (status = 'pending'
                or (status = 'processing' and claimed_at < now() - make_interval(secs => ${retryAfterSeconds}))
              or (status = 'failed' and updated_at < now() - make_interval(secs => ${retryAfterSeconds}) and exists (select 1 from payment_refund_reservation r where r.organization_id = payment_refund_intent.organization_id and r.intent_id = payment_refund_intent.id and r.status = 'reserved' and (r.needs_review_at is null or r.execution_uncertain or r.execution_token is not null))))
            order by created_at limit 1 for update skip locked)
          returning id, trigger, cancelled_at`),
      );
      if (!intent) return null;
      const finishMissing = async () => {
        await db
          .update(paymentRefundIntents)
          .set({
            status: 'failed',
            failure: 'intent_data_missing',
            updatedAt: new Date(),
          })
          .where(eq(paymentRefundIntents.id, intent.id));
        return null;
      };
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
      if (!invoice) return finishMissing();
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
      if (!event || !settings) return finishMissing();
      const payments = rows<{ id: string; cents: number; paid: number }>(
        await db.execute(sql`
          select p.provider_payment_id as id, sum(p.amount_cents)::int as cents,
            coalesce(sum(p.amount_cents) filter (where p.provider_refund_id is null and p.amount_cents > 0), 0)::int as paid
          from invoice_payment p
          where p.organization_id = ${ctx.organizationId} and p.invoice_id = ${invoiceId}
            and p.provider_payment_id is not null
          group by p.provider_payment_id having sum(p.amount_cents) > 0`),
      );
      return {
        id: intent.id,
        invoiceId,
        trigger: intent.trigger as RefundTrigger,
        cancelledAt: new Date(intent.cancelled_at),
        eventStartsOn: String(event.startsOn),
        policy: settings.refundPolicy,
        payments: payments.map((payment) => ({
          invoiceId,
          providerPaymentId: payment.id,
          refundableCents: Number(payment.cents),
          paidCents: Number(payment.paid),
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
          // Progress adds up when a stale intent is taken over after a partial run.
          refundedCents: sql`${paymentRefundIntents.refundedCents} + ${result.refundedCents}`,
          failure: result.failure,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRefundIntents.organizationId, ctx.organizationId),
            eq(paymentRefundIntents.id, intentId),
            eq(paymentRefundIntents.status, 'processing'),
          ),
        );
    },
  };
}
