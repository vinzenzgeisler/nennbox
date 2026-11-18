import Stripe from 'stripe';
import type {
  CheckoutSessionRequest,
  PaymentProvider,
  PaymentProviderEvent,
  PaymentRefundRequest,
} from '@racepilot/core';

export interface StripePaymentProviderOptions {
  readonly secretKey: string;
  readonly webhookSecret: string;
  /** Optional local stripe-mock endpoint; never set in production. */
  readonly apiBaseUrl?: string;
}

/** Community adapter. Cloud can supply an account-aware implementation of the same core port. */
export function createStripePaymentProvider(
  options: StripePaymentProviderOptions,
): PaymentProvider {
  const base = options.apiBaseUrl ? new URL(options.apiBaseUrl) : null;
  if (base && !['http:', 'https:'].includes(base.protocol))
    throw new Error('Invalid Stripe API base URL');
  const stripe = new Stripe(
    options.secretKey,
    base
      ? {
          host: base.hostname,
          port: base.port || (base.protocol === 'https:' ? 443 : 80),
          protocol: base.protocol.slice(0, -1) as 'http' | 'https',
        }
      : {},
  );
  return {
    async createCheckoutSession(request: CheckoutSessionRequest) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          client_reference_id: request.invoiceId,
          metadata: {
            organizationId: request.organizationId,
            invoiceId: request.invoiceId,
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: request.currency.toLowerCase(),
                unit_amount: request.amountCents,
                product_data: { name: request.description },
              },
            },
          ],
          ...(request.paymentMethods.length > 0
            ? { payment_method_types: [...request.paymentMethods] }
            : {}),
        },
        { idempotencyKey: request.idempotencyKey },
      );
      if (!session.url) throw new Error('Stripe did not return a checkout URL');
      return { id: session.id, url: session.url };
    },
    async verifyWebhook(
      rawBody: string,
      signature: string,
    ): Promise<PaymentProviderEvent> {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        options.webhookSecret,
      );
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object;
        if (session.payment_status !== 'paid')
          throw new Error('Checkout is not paid');
        const metadata = session.metadata;
        if (
          !metadata?.organizationId ||
          !metadata.invoiceId ||
          typeof session.payment_intent !== 'string'
        )
          throw new Error('Checkout metadata is incomplete');
        return {
          id: event.id,
          organizationId:
            metadata.organizationId as PaymentProviderEvent['organizationId'],
          invoiceId: metadata.invoiceId,
          type: 'succeeded',
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? 'eur',
          paymentId: session.payment_intent,
        };
      }
      if (
        event.type === 'checkout.session.expired' ||
        event.type === 'checkout.session.async_payment_failed'
      ) {
        const object = event.data.object;
        const metadata = object.metadata;
        if (!metadata?.organizationId || !metadata.invoiceId)
          throw new Error('Payment metadata is incomplete');
        return {
          id: event.id,
          organizationId:
            metadata.organizationId as PaymentProviderEvent['organizationId'],
          invoiceId: metadata.invoiceId,
          type:
            event.type === 'checkout.session.expired' ? 'expired' : 'failed',
          amountCents: object.amount_total ?? 0,
          currency: object.currency ?? 'eur',
          paymentId:
            'payment_intent' in object &&
            typeof object.payment_intent === 'string'
              ? object.payment_intent
              : object.id,
        };
      }
      throw new Error('Unsupported Stripe event');
    },
    async refund(request: PaymentRefundRequest) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: request.paymentId,
          amount: request.amountCents,
          reason: 'requested_by_customer',
          metadata: {
            organizationId: request.organizationId,
            invoiceId: request.invoiceId,
            reason: request.reason,
          },
        },
        {
          idempotencyKey: `refund:${request.paymentId}:${request.amountCents}:${request.reason}`,
        },
      );
      return { id: refund.id };
    },
  };
}
