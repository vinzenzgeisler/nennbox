import type { ApiRoutesContext } from './context.js';
import { z } from 'zod';
import { createInvoiceCheckout } from './invoice-checkout.js';
import {
  RefundRejectedError,
  recordInvoicePayment,
  correctInvoicePayment,
  updatePaymentRecipient,
} from '@nennbox/core';

export function registerPaymentsRoutes(context: ApiRoutesContext): void {
  const { app, deps, requireMember } = context;
  app.get('/admin/organization/payment-recipient', async (c) => {
    const guard = await requireMember(c.req.raw, 'organization:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const recipient = await deps.paymentRecipients.get(context);
    return c.json({ recipient });
  });
  app.put('/admin/organization/payment-recipient', async (c) => {
    const guard = await requireMember(c.req.raw, 'organization:update');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = z
      .object({
        accountName: z.string().trim().min(1).max(70),
        address: z.string().max(1000).nullable().optional(),
        iban: z.string().min(15).max(34),
        bic: z.string().max(11).nullable().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      return c.json({
        recipient: await updatePaymentRecipient(
          context,
          {
            accountName: parsed.data.accountName,
            address: parsed.data.address ?? null,
            iban: parsed.data.iban,
            ...(parsed.data.bic !== undefined ? { bic: parsed.data.bic } : {}),
          },
          { recipients: deps.paymentRecipients },
        ),
      });
    } catch {
      return c.json({ error: 'Invalid payment recipient' }, 400);
    }
  });
  app.delete('/admin/organization/payment-recipient', async (c) => {
    const guard = await requireMember(c.req.raw, 'organization:update');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.paymentRecipients.delete)
      return c.json({ error: 'Unavailable' }, 503);
    await deps.paymentRecipients.delete(guard.context);
    return c.json({ recipient: null });
  });
  app.post('/admin/invoices/:invoiceId/payments', async (c) => {
    const guard = await requireMember(c.req.raw, 'payment:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = z
      .object({
        amountCents: z.number().int().positive(),
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await recordInvoicePayment(
        context,
        c.req.param('invoiceId'),
        parsed.data.amountCents,
        context.subject
          ? `${context.subject.issuer}#${context.subject.subject}`
          : context.correlationId,
        parsed.data.reason,
        { payments: deps.payments },
      );
      return result ? c.json(result, 201) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid payment' }, 403);
    }
  });
  app.post('/admin/payments/:paymentId/corrections', async (c) => {
    const guard = await requireMember(c.req.raw, 'payment:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const parsed = z
      .object({ reason: z.string().trim().min(1).max(1000) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const result = await correctInvoicePayment(
        context,
        c.req.param('paymentId'),
        context.subject
          ? `${context.subject.issuer}#${context.subject.subject}`
          : context.correlationId,
        parsed.data.reason,
        { payments: deps.payments },
      );
      return result ? c.json(result, 201) : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden or invalid correction' }, 403);
    }
  });
}

/** Stripe callbacks are authenticated by the provider signature, not member auth. */
export function registerPaymentProviderRoutes(context: ApiRoutesContext): void {
  const { app, deps, resolvePublicContext } = context;
  app.post(
    '/public/organizations/:organizationId/invoices/:invoiceId/checkout',
    async (c) => {
      if (!deps.paymentProvider || !deps.checkoutRepository)
        return c.json({ error: 'Unavailable' }, 503);
      const requestContext = await resolvePublicContext(c.req.raw);
      if (
        !requestContext ||
        requestContext.organizationId !== c.req.param('organizationId')
      )
        return c.json({ error: 'Not found' }, 404);
      const requested = z
        .object({
          paymentMethods: z
            .array(z.enum(['card', 'sepa_debit', 'paypal', 'klarna']))
            .min(1)
            .max(4)
            .optional(),
        })
        .strict()
        .safeParse(await c.req.json().catch(() => ({})));
      if (!requested.success)
        return c.json({ error: 'Invalid payment methods' }, 400);
      const result = await createInvoiceCheckout(
        deps,
        requestContext,
        c.req.param('invoiceId'),
        (slug) => `/events/${encodeURIComponent(slug)}/register`,
        {
          methods: {
            kind: 'configured',
            ...(requested.data.paymentMethods
              ? { requested: requested.data.paymentMethods }
              : {}),
          },
          referenceInvoice: true,
        },
      );
      if (result.status === 201) return c.json({ url: result.url }, 201);
      if (result.status === 400)
        return c.json({ error: 'Payment method unavailable' }, 400);
      if (result.status === 409)
        return c.json({ error: 'Payment pending' }, 409);
      return result.status === 404
        ? c.json({ error: 'Not found' }, 404)
        : c.json({ error: 'Unavailable' }, 503);
    },
  );

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
    if (reservation.status !== 'reserved')
      return c.json({ error: 'Refund amount unavailable' }, 409);
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
      if (error instanceof RefundRejectedError)
        await deps.paymentRefunds.rejectReservation?.(
          guard.context,
          reservation.idempotencyKey,
        );
      deps.logger.warn('Stripe provider refund failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
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

  app.post('/webhooks/stripe', async (c) => {
    if (!deps.paymentProvider || !deps.checkoutRepository)
      return c.json({ error: 'Unavailable' }, 503);
    const signature = c.req.header('stripe-signature');
    if (!signature) return c.json({ error: 'Invalid signature' }, 400);
    try {
      const event = await deps.paymentProvider.verifyWebhook(
        await c.req.text(),
        signature,
      );
      // Authentic but nothing to apply (other event type, payment still pending).
      if (!event) return c.json({ received: true, ignored: true });
      if (
        context.mode === 'community' &&
        event.organizationId !== context.communityOrganizationId
      ) {
        deps.logger.warn('Stripe webhook for a foreign organization rejected', {
          eventId: event.id,
        });
        return c.json({ error: 'Invalid event' }, 400);
      }
      const result = await deps.checkoutRepository.applyProviderEvent(event);
      if (result === 'not_found') {
        deps.logger.warn('Stripe webhook does not match any open invoice', {
          eventId: event.id,
          outcome: event.type,
        });
        return c.json({ error: 'Unknown payment' }, 404);
      }
      if (result === 'applied_with_mismatch')
        deps.logger.warn(
          'Stripe payment differs from the open invoice amount; recorded as received',
          { eventId: event.id, invoiceId: event.invoiceId },
        );
      return c.json({
        received: true,
        duplicate: result === 'duplicate',
        ...(result === 'applied_with_mismatch' ? { amountMismatch: true } : {}),
      });
    } catch (error) {
      deps.logger.warn('Stripe webhook rejected', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return c.json({ error: 'Invalid webhook' }, 400);
    }
  });
}
