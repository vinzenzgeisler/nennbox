import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import type {
  CheckoutSessionExpiryRequest,
  CheckoutSessionRequest,
  PaymentProvider,
  PaymentProviderEvent,
  PaymentRefundRequest,
} from '@nennbox/core';

export interface StripePaymentProviderOptions {
  readonly secretKey: string;
  readonly webhookSecret: string;
  /** Optional local stripe-mock endpoint; never set in production. */
  readonly apiBaseUrl?: string;
}

/**
 * Community adapter: one Stripe account, configured through the deployment's own
 * keys. Cloud supplies an account-aware implementation of the same core port
 * (docs/architecture/payments.md); this one refuses events of connected accounts.
 */
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
          ...(request.expiresAt
            ? {
                expires_at: Math.max(
                  Math.ceil(Date.now() / 1000) + 1800,
                  Math.floor(Date.parse(request.expiresAt) / 1000),
                ),
              }
            : {}),
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
      return {
        id: session.id,
        url: session.url,
        expiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
      };
    },
    async expireCheckoutSession(request: CheckoutSessionExpiryRequest) {
      try {
        await stripe.checkout.sessions.expire(request.sessionId);
        return 'expired' as const;
      } catch (error) {
        // Stripe refuses to expire a session that is already expired or completed.
        // Telling them apart decides whether a replacement may be created at all.
        const session = await stripe.checkout.sessions
          .retrieve(request.sessionId)
          .catch(() => null);
        if (session?.status === 'expired') return 'expired' as const;
        if (session?.status === 'complete') return 'completed' as const;
        throw error;
      }
    },
    async verifyWebhook(
      rawBody: string,
      signature: string,
    ): Promise<PaymentProviderEvent | null> {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        options.webhookSecret,
      );
      if (event.account)
        throw new Error('Connected-account events are not accepted');
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object;
        // SEPA debit completes the checkout first and confirms the money later
        // (async_payment_succeeded or _failed); nothing to apply until then.
        if (session.payment_status !== 'paid') return null;
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
          sessionId: session.id,
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
          sessionId: object.id,
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
      return null;
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
          idempotencyKey: request.idempotencyKey,
        },
      );
      return { id: refund.id };
    },
  };
}

const secretNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;

/**
 * Stripe secrets come from the environment or, when `<NAME>_FILE` is set, from
 * that file (Docker/systemd secrets), so they never need to sit in a unit file
 * or in the database. Both forms for one secret, an unreadable file and an empty
 * file are configuration errors; none of them silently disables online payment.
 */
export function resolveStripeSecretFiles(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const resolved = { ...env };
  for (const name of secretNames) {
    const file = env[`${name}_FILE`];
    if (!file) continue;
    if (env[name])
      throw new Error(`Invalid configuration variables: ${name}, ${name}_FILE`);
    let value: string;
    try {
      value = readFileSync(file, 'utf8').trim();
    } catch {
      throw new Error(`Invalid configuration variables: ${name}_FILE`);
    }
    if (!value)
      throw new Error(`Invalid configuration variables: ${name}_FILE`);
    resolved[name] = value;
  }
  return resolved;
}
