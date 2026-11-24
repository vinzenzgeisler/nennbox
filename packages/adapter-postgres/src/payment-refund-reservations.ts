import { and, eq, sql } from 'drizzle-orm';
import { refundPercent, refundDueCents } from '@nennbox/core';
import type {
  RefundReservation,
  RefundReservationRequest,
  RequestContext,
} from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { loadPaymentSettings } from './payment-settings.js';
import { events } from './schema/organization.js';
import { invoices } from './schema/billing.js';
import {
  paymentRefundIntents,
  paymentRefundReservations,
} from './schema/provider-payments.js';
import { countActiveEntries } from './entry-group-activity.js';

const rows = <T>(result: unknown) => (result as { rows: T[] }).rows;

/**
 * The one place that decides how much of a provider payment may still be
 * refunded. Runs under the invoice row lock that `recordRefund` and the
 * cancellation also take, so a refund that is booked or reserved elsewhere is
 * always visible here, and two refunds can never both claim the same remainder.
 * Manual and automatic refunds both go through here before the provider is called.
 */
export async function reserveRefund(
  db: Database,
  ctx: RequestContext,
  request: RefundReservationRequest,
): Promise<RefundReservation> {
  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({
        currency: invoices.currency,
        groupId: invoices.registrationGroupId,
        eventId: invoices.eventId,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organizationId),
          eq(invoices.id, request.invoiceId),
        ),
      )
      .for('update');
    if (!invoice) return { status: 'unavailable' };
    const automatic = request.source.kind === 'automatic';
    const active = automatic
      ? await countActiveEntries(tx, ctx.organizationId, invoice.groupId)
      : 0;
    const [existing] = await tx
      .select()
      .from(paymentRefundReservations)
      .where(
        and(
          eq(paymentRefundReservations.organizationId, ctx.organizationId),
          eq(paymentRefundReservations.idempotencyKey, request.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.invoiceId !== request.invoiceId ||
        existing.providerPaymentId !== request.providerPaymentId ||
        existing.source !== request.source.kind ||
        (request.source.kind === 'manual' &&
          existing.amountCents !== request.source.amountCents)
      )
        return { status: 'unavailable' };
      if (existing.status === 'completed')
        return {
          status: 'completed',
          amountCents: existing.amountCents,
          providerRefundId: existing.providerRefundId,
        };
      // Resuming: the provider may already have executed it, so it is never
      // restarted for a registration that takes part again.
      if (automatic && active > 0) return { status: 'needs_review' };
      return reserved(existing, invoice.currency);
    }
    if (request.source.kind === 'automatic') {
      const [intent] = await tx
        .select({ status: paymentRefundIntents.status })
        .from(paymentRefundIntents)
        .where(
          and(
            eq(paymentRefundIntents.organizationId, ctx.organizationId),
            eq(paymentRefundIntents.id, request.source.intentId),
          ),
        )
        .limit(1);
      if (intent?.status !== 'processing' || active > 0)
        return { status: 'reactivated' };
    }
    const [ledger] = rows<{ paid: number; refundable: number }>(
      await tx.execute(sql`
        select
          coalesce(sum(amount_cents) filter (where provider_refund_id is null and amount_cents > 0), 0)::int as paid,
          coalesce(sum(amount_cents), 0)::int
            - (select coalesce(sum(r.amount_cents), 0)::int from payment_refund_reservation r
               where r.organization_id = ${ctx.organizationId} and r.invoice_id = ${request.invoiceId}
                 and r.provider_payment_id = ${request.providerPaymentId} and r.status = 'reserved') as refundable
        from invoice_payment
        where organization_id = ${ctx.organizationId} and invoice_id = ${request.invoiceId}
          and provider_payment_id = ${request.providerPaymentId}`),
    );
    const paid = Number(ledger?.paid ?? 0);
    const refundable = Number(ledger?.refundable ?? 0);
    const amountCents =
      request.source.kind === 'manual'
        ? request.source.amountCents
        : refundDueCents(paid, refundable, request.source.percent);
    if (request.source.kind === 'manual') {
      // Once a cancellation policy applies, manual and automatic operations share
      // its gross target, including operations still unresolved at the provider.
      let available = refundable;
      if (
        (await countActiveEntries(tx, ctx.organizationId, invoice.groupId)) ===
        0
      ) {
        const [intent] = await tx
          .select()
          .from(paymentRefundIntents)
          .where(
            and(
              eq(paymentRefundIntents.organizationId, ctx.organizationId),
              eq(paymentRefundIntents.invoiceId, request.invoiceId),
            ),
          )
          .orderBy(sql`${paymentRefundIntents.createdAt} desc`)
          .limit(1);
        const [event] = await tx
          .select({ startsOn: events.startsOn })
          .from(events)
          .where(
            and(
              eq(events.organizationId, ctx.organizationId),
              eq(events.id, invoice.eventId),
            ),
          );
        const settings = await loadPaymentSettings(
          tx,
          ctx.organizationId,
          invoice.eventId,
        );
        if (intent && event && settings?.refundPolicy.enabled) {
          available = refundDueCents(
            paid,
            refundable,
            refundPercent(
              settings.refundPolicy,
              intent.trigger as 'withdrawn' | 'rejected',
              intent.cancelledAt,
              String(event.startsOn),
            ),
          );
        }
      }
      if (amountCents <= 0 || amountCents > available)
        return { status: 'unavailable' };
    } else if (amountCents <= 0) return { status: 'nothing_due' };
    const [created] = await tx
      .insert(paymentRefundReservations)
      .values({
        organizationId: ctx.organizationId,
        invoiceId: request.invoiceId,
        providerPaymentId: request.providerPaymentId,
        idempotencyKey: request.idempotencyKey,
        source: request.source.kind,
        intentId:
          request.source.kind === 'automatic' ? request.source.intentId : null,
        amountCents,
      })
      .returning();
    return reserved(created!, invoice.currency);
  });
}

const reserved = (
  row: typeof paymentRefundReservations.$inferSelect,
  currency: string,
): RefundReservation => ({
  status: 'reserved',
  invoiceId: row.invoiceId,
  providerPaymentId: row.providerPaymentId,
  idempotencyKey: row.idempotencyKey,
  amountCents: row.amountCents,
  currency,
});

/** Marks the reservation a ledger refund fulfils; called inside the booking transaction. */
export async function completeReservation(
  tx: TransactionDatabase,
  organizationId: string,
  idempotencyKey: string,
  providerRefundId: string,
): Promise<void> {
  await tx
    .update(paymentRefundReservations)
    .set({ status: 'completed', providerRefundId, updatedAt: new Date() })
    .where(
      and(
        eq(paymentRefundReservations.organizationId, organizationId),
        eq(paymentRefundReservations.idempotencyKey, idempotencyKey),
        eq(paymentRefundReservations.status, 'reserved'),
      ),
    );
}
