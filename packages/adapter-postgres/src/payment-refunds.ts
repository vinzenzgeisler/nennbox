import { and, eq, sql } from 'drizzle-orm';
import type { PaymentRefundRepository } from '@nennbox/core';
import { paymentRefundReservations } from './schema/provider-payments.js';
import { withRefundExecution } from './payment-refund-execution.js';
import type { Database } from './database.js';
import {
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';
import { deriveInvoiceStatus } from '@nennbox/core';
import {
  completeReservation,
  rejectReservation,
  reserveRefund,
} from './payment-refund-reservations.js';
import {
  abandonRefundReservation,
  recordFailedRefundAttempt,
} from './payment-refund-review.js';

export function createPaymentRefundRepository(
  db: Database,
): PaymentRefundRepository {
  return {
    withExecution: (ctx, key, run) => withRefundExecution(db, ctx, key, run),
    getRefundable: async (ctx, invoiceId, providerPaymentId) => {
      const [row] = await db
        .select({
          invoiceId: invoices.id,
          currency: invoices.currency,
          original: sql<number>`coalesce(sum(${invoicePayments.amountCents}) filter (where ${invoicePayments.providerRefundId} is null and ${invoicePayments.amountCents} > 0), 0)::int`,
          refunded: sql<number>`coalesce(-sum(${invoicePayments.amountCents}) filter (where ${invoicePayments.providerRefundId} is not null), 0)::int`,
        })
        .from(invoices)
        .leftJoin(
          invoicePayments,
          and(
            eq(invoicePayments.organizationId, invoices.organizationId),
            eq(invoicePayments.invoiceId, invoices.id),
            eq(invoicePayments.providerPaymentId, providerPaymentId),
          ),
        )
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.id, invoiceId),
          ),
        )
        .groupBy(invoices.id);
      if (!row || Number(row.original) <= Number(row.refunded)) return null;
      return {
        invoiceId: row.invoiceId,
        providerPaymentId,
        refundableCents: Number(row.original) - Number(row.refunded),
        currency: row.currency,
      };
    },
    rejectReservation: (ctx, key) => rejectReservation(db, ctx, key),
    recordFailedAttempt: (ctx, key, errorCode) =>
      recordFailedRefundAttempt(db, ctx, key, errorCode),
    abandonReservation: (ctx, request) =>
      abandonRefundReservation(db, ctx, request),
    reserve: (ctx, request) => reserveRefund(db, ctx, request),
    recordRefund: async (ctx, input) =>
      db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, input.invoiceId),
            ),
          )
          .for('update');
        if (!invoice) return null;
        // Only after the invoice lock: a concurrent call with the same provider refund id
        // has committed by now, so this one answers 'duplicate' instead of failing on the unique key.
        const existing = await tx
          .select({ id: invoicePayments.id })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.providerRefundId, input.providerRefundId),
            ),
          )
          .limit(1);
        if (existing.length) {
          if (input.reservationKey)
            await completeReservation(
              tx,
              ctx.organizationId,
              input.reservationKey,
              input.providerRefundId,
            );
          return 'duplicate';
        }
        // A stale caller must not book against a released/foreign reservation.
        if (input.reservationKey) {
          const [operation] = await tx
            .select()
            .from(paymentRefundReservations)
            .where(
              and(
                eq(
                  paymentRefundReservations.organizationId,
                  ctx.organizationId,
                ),
                eq(
                  paymentRefundReservations.idempotencyKey,
                  input.reservationKey,
                ),
              ),
            );
          if (
            !operation ||
            operation.status !== 'reserved' ||
            operation.invoiceId !== input.invoiceId ||
            operation.providerPaymentId !== input.providerPaymentId ||
            operation.amountCents !== input.amountCents
          )
            return null;
        }
        const [outstanding] = await tx
          .select({
            amount: sql<number>`coalesce(sum(${paymentRefundReservations.amountCents}), 0)::int`,
          })
          .from(paymentRefundReservations)
          .where(
            and(
              eq(paymentRefundReservations.organizationId, ctx.organizationId),
              eq(paymentRefundReservations.invoiceId, input.invoiceId),
              eq(
                paymentRefundReservations.providerPaymentId,
                input.providerPaymentId,
              ),
              eq(paymentRefundReservations.status, 'reserved'),
              sql`${paymentRefundReservations.idempotencyKey} <> ${input.reservationKey ?? ''}`,
            ),
          );
        const [refundable] = await tx
          .select({
            amount: sql<number>`coalesce(sum(${invoicePayments.amountCents}) filter (where ${invoicePayments.providerRefundId} is null and ${invoicePayments.amountCents} > 0), 0)::int + coalesce(sum(${invoicePayments.amountCents}) filter (where ${invoicePayments.providerRefundId} is not null), 0)::int`,
          })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.invoiceId, input.invoiceId),
              eq(invoicePayments.providerPaymentId, input.providerPaymentId),
            ),
          );
        if (
          input.amountCents <= 0 ||
          input.amountCents >
            Number(refundable?.amount ?? 0) - Number(outstanding?.amount ?? 0)
        )
          return null;
        const [payment] = await tx
          .insert(invoicePayments)
          .values({
            organizationId: ctx.organizationId,
            invoiceId: input.invoiceId,
            amountCents: -input.amountCents,
            providerPaymentId: input.providerPaymentId,
            providerRefundId: input.providerRefundId,
            method: 'online',
            actor: input.actor,
            reason: input.reason,
          })
          .returning({ id: invoicePayments.id });
        await tx.insert(invoicePaymentAuditEvents).values({
          organizationId: ctx.organizationId,
          paymentId: payment!.id,
          action: 'refund',
          actor: input.actor,
          reason: input.reason,
        });
        const [sum] = await tx
          .select({
            amount: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)::int`,
          })
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.organizationId, ctx.organizationId),
              eq(invoicePayments.invoiceId, input.invoiceId),
            ),
          );
        await tx
          .update(invoices)
          .set({
            status:
              invoice.status === 'cancelled'
                ? 'cancelled'
                : deriveInvoiceStatus(
                    invoice.totalCents,
                    Number(sum?.amount ?? 0),
                  ),
          })
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, input.invoiceId),
            ),
          );
        if (input.reservationKey)
          await completeReservation(
            tx,
            ctx.organizationId,
            input.reservationKey,
            input.providerRefundId,
          );
        return 'recorded';
      }),
  };
}
