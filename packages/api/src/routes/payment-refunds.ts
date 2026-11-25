import { z } from 'zod';
import { RefundRejectedError, errorCodeOf } from '@nennbox/core';
import type { ApiRoutesContext } from './context.js';

/** Manual refunds of online payments and the office decision for a stuck one. */
export function registerPaymentRefundRoutes(context: ApiRoutesContext): void {
  const { app, deps } = context;
  app.post('/admin/invoices/:invoiceId/refunds', async (c) => {
    if (!deps.paymentProvider || !deps.paymentRefunds)
      return c.json({ error: 'Unavailable' }, 503);
    const guard = await context.requireMember(c.req.raw, 'payment:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const parsed = z
      .object({
        providerPaymentId: z.string().min(1).max(255),
        amountCents: z.number().int().positive(),
        reason: z.string().trim().min(1).max(1000),
        idempotencyKey: z.string().uuid(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const invoiceId = c.req.param('invoiceId');
    const actor = guard.context.subject
      ? `${guard.context.subject.issuer}#${guard.context.subject.subject}`
      : guard.context.correlationId;
    // Reserve first: the amount is checked against the ledger and against refunds
    // reserved by others (automatic ones included) under the invoice lock.
    let reservation;
    try {
      reservation = await deps.paymentRefunds.reserve(guard.context, {
        invoiceId,
        providerPaymentId: parsed.data.providerPaymentId,
        idempotencyKey: parsed.data.idempotencyKey,
        source: {
          kind: 'manual',
          amountCents: parsed.data.amountCents,
          actor,
          reason: parsed.data.reason,
        },
      });
    } catch (error) {
      deps.logger.warn('Stripe refund could not be reserved', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return c.json({ error: 'Refund unavailable' }, 503);
    }
    if (reservation.status === 'completed')
      return c.json(
        { refundId: reservation.providerRefundId, duplicate: true },
        201,
      );
    if (reservation.status === 'needs_review')
      return c.json(
        { error: 'Refund needs review', reason: 'needs_review' },
        409,
      );
    if (reservation.status !== 'reserved')
      return c.json(
        {
          error: 'Refund amount unavailable',
          reason:
            reservation.status === 'unavailable'
              ? reservation.reason
              : 'unavailable',
          ...(reservation.status === 'unavailable' &&
          reservation.availableCents !== undefined
            ? { availableCents: reservation.availableCents }
            : {}),
        },
        409,
      );
    let refund: { readonly id: string };
    try {
      refund = await deps.paymentProvider.refund({
        idempotencyKey: reservation.idempotencyKey,
        organizationId: guard.context.organizationId,
        invoiceId: reservation.invoiceId,
        paymentId: reservation.providerPaymentId,
        amountCents: reservation.amountCents,
        reason: parsed.data.reason,
      });
    } catch (error) {
      let needsReview = false;
      if (error instanceof RefundRejectedError)
        await deps.paymentRefunds.rejectReservation?.(
          guard.context,
          reservation.idempotencyKey,
        );
      else
        needsReview =
          (await deps.paymentRefunds.recordFailedAttempt?.(
            guard.context,
            reservation.idempotencyKey,
            errorCodeOf(error),
          )) === 'needs_review';
      deps.logger.warn('Stripe provider refund failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      // A reservation flagged for review stays but is no longer retried, so the
      // office has to decide; the dialog then points to the entry detail.
      if (needsReview)
        return c.json(
          { error: 'Refund needs review', reason: 'needs_review' },
          409,
        );
      return c.json({ error: 'Refund unavailable' }, 503);
    }
    try {
      const result = await deps.paymentRefunds.recordRefund(guard.context, {
        invoiceId: reservation.invoiceId,
        providerPaymentId: reservation.providerPaymentId,
        refundableCents: reservation.amountCents,
        currency: reservation.currency,
        amountCents: reservation.amountCents,
        providerRefundId: refund.id,
        actor,
        reason: parsed.data.reason,
        reservationKey: reservation.idempotencyKey,
      });
      return result
        ? c.json(
            { refundId: refund.id, duplicate: result === 'duplicate' },
            201,
          )
        : c.json({ error: 'Refund could not be recorded' }, 409);
    } catch (error) {
      deps.logger.warn('Stripe refund ledger write failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return c.json({ error: 'Refund unavailable' }, 503);
    }
  });

  // Office decision for a refund the provider could not settle repeatedly: the
  // refund did not happen at the provider (checked in the dashboard), so the
  // reserved amount is released. Only reservations flagged for review qualify.
  app.post(
    '/admin/invoices/:invoiceId/refund-reservations/:key/abandon',
    async (c) => {
      if (!deps.paymentRefunds?.abandonReservation)
        return c.json({ error: 'Unavailable' }, 503);
      const guard = await context.requireMember(c.req.raw, 'payment:write');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const parsed = z
        .object({ reason: z.string().trim().min(1).max(1000) })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
      const result = await deps.paymentRefunds.abandonReservation(
        guard.context,
        {
          invoiceId: c.req.param('invoiceId'),
          key: c.req.param('key'),
          actor: guard.context.subject
            ? `${guard.context.subject.issuer}#${guard.context.subject.subject}`
            : guard.context.correlationId,
          reason: parsed.data.reason,
        },
      );
      if (result === 'not_found') return c.json({ error: 'Not found' }, 404);
      if (result === 'not_reviewable')
        return c.json(
          {
            error: 'Refund is not waiting for review',
            reason: 'not_reviewable',
          },
          409,
        );
      return c.json({ abandoned: true });
    },
  );
}
