import { and, eq, sql } from 'drizzle-orm';
import {
  paymentRefundReservations,
  invoices,
  createPaymentRefundRepository,
  type Database,
} from '@nennbox/adapter-postgres';
import { RefundRejectedError } from '@nennbox/core';
import type { PaymentProvider, RequestContext } from '@nennbox/core';

/** Resume manual operations even when their originating browser no longer exists. */
export async function retryManualRefundReservations(
  db: Database,
  ctx: RequestContext,
  provider: PaymentProvider,
  retryAfterMs: number,
) {
  const pending = await db
    .select({
      operation: paymentRefundReservations,
      currency: invoices.currency,
    })
    .from(paymentRefundReservations)
    .innerJoin(
      invoices,
      and(
        eq(invoices.organizationId, paymentRefundReservations.organizationId),
        eq(invoices.id, paymentRefundReservations.invoiceId),
      ),
    )
    .where(
      and(
        eq(paymentRefundReservations.organizationId, ctx.organizationId),
        eq(paymentRefundReservations.source, 'manual'),
        eq(paymentRefundReservations.status, 'reserved'),
        sql`${paymentRefundReservations.updatedAt} < now() - make_interval(secs => ${Math.max(1, Math.round(retryAfterMs / 1000))})`,
      ),
    )
    .limit(50);
  const refunds = createPaymentRefundRepository(db);
  for (const { operation, currency } of pending) {
    try {
      const result = await provider.refund({
        organizationId: ctx.organizationId,
        invoiceId: operation.invoiceId,
        paymentId: operation.providerPaymentId,
        idempotencyKey: operation.idempotencyKey,
        amountCents: operation.amountCents,
        reason: operation.reason,
      });
      await refunds.recordRefund(ctx, {
        invoiceId: operation.invoiceId,
        providerPaymentId: operation.providerPaymentId,
        currency,
        refundableCents: operation.amountCents,
        amountCents: operation.amountCents,
        providerRefundId: result.id,
        actor: operation.actor,
        reason: operation.reason,
        reservationKey: operation.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof RefundRejectedError) {
        await refunds.rejectReservation?.(ctx, operation.idempotencyKey);
        continue;
      }
      // Never release an ambiguous transfer: the same operation remains retryable.
      await db
        .update(paymentRefundReservations)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(paymentRefundReservations.organizationId, ctx.organizationId),
            eq(paymentRefundReservations.id, operation.id),
          ),
        );
    }
  }
}
