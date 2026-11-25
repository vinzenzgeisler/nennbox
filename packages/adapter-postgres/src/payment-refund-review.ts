import { and, eq, sql } from 'drizzle-orm';
import { MAX_REFUND_ATTEMPTS } from '@nennbox/core';
import type { RequestContext } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { invoices } from './schema/billing.js';
import {
  paymentRefundIntents,
  paymentRefundReservations,
} from './schema/provider-payments.js';

/**
 * A failed attempt that is not a definitive rejection. The reservation keeps
 * blocking its amount; after `MAX_REFUND_ATTEMPTS` it is flagged for review and
 * left to the office instead of being retried forever.
 */
export async function recordFailedRefundAttempt(
  db: Database,
  ctx: RequestContext,
  key: string,
  errorCode: string,
): Promise<'retry' | 'needs_review'> {
  return db.transaction(async (tx) => {
    const [operation] = await tx
      .select({ invoiceId: paymentRefundReservations.invoiceId })
      .from(paymentRefundReservations)
      .where(
        and(
          eq(paymentRefundReservations.organizationId, ctx.organizationId),
          eq(paymentRefundReservations.idempotencyKey, key),
        ),
      );
    if (!operation) return 'retry';
    await lockInvoiceRow(tx, ctx.organizationId, operation.invoiceId);
    const [updated] = await tx
      .update(paymentRefundReservations)
      .set({
        attempts: sql`${paymentRefundReservations.attempts} + 1`,
        lastError: errorCode.slice(0, 80),
        needsReviewAt: sql`case when ${paymentRefundReservations.attempts} + 1 >= ${MAX_REFUND_ATTEMPTS} then coalesce(${paymentRefundReservations.needsReviewAt}, now()) else ${paymentRefundReservations.needsReviewAt} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentRefundReservations.organizationId, ctx.organizationId),
          eq(paymentRefundReservations.idempotencyKey, key),
          eq(paymentRefundReservations.status, 'reserved'),
        ),
      )
      .returning({ needsReviewAt: paymentRefundReservations.needsReviewAt });
    return updated?.needsReviewAt ? 'needs_review' : 'retry';
  });
}

/**
 * Office decision for a reservation flagged for review: the refund did not
 * happen at the provider (the office checked), so the amount is released. Only
 * a flagged reservation can be abandoned, never one a request may still be
 * executing. The decision is stored with actor and reason.
 */
export async function abandonRefundReservation(
  db: Database,
  ctx: RequestContext,
  request: { invoiceId: string; key: string; actor: string; reason: string },
): Promise<'abandoned' | 'not_found' | 'not_reviewable'> {
  return db.transaction(async (tx) => {
    if (!(await lockInvoiceRow(tx, ctx.organizationId, request.invoiceId)))
      return 'not_found';
    const [operation] = await tx
      .select()
      .from(paymentRefundReservations)
      .where(
        and(
          eq(paymentRefundReservations.organizationId, ctx.organizationId),
          eq(paymentRefundReservations.invoiceId, request.invoiceId),
          eq(paymentRefundReservations.idempotencyKey, request.key),
        ),
      );
    if (!operation) return 'not_found';
    if (operation.status !== 'reserved' || !operation.needsReviewAt)
      return 'not_reviewable';
    await tx
      .update(paymentRefundReservations)
      .set({
        status: 'abandoned',
        resolvedBy: request.actor,
        resolvedReason: request.reason,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentRefundReservations.id, operation.id));
    if (operation.intentId)
      await tx
        .update(paymentRefundIntents)
        .set({
          status: 'failed',
          failure: 'reservation_abandoned',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRefundIntents.organizationId, ctx.organizationId),
            eq(paymentRefundIntents.id, operation.intentId),
            eq(paymentRefundIntents.status, 'failed'),
          ),
        );
    return 'abandoned';
  });
}

async function lockInvoiceRow(
  tx: TransactionDatabase,
  organizationId: string,
  invoiceId: string,
): Promise<boolean> {
  const [invoice] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.id, invoiceId),
      ),
    )
    .for('update');
  return !!invoice;
}
