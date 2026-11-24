import { resolveCanonicalOrigin } from '@nennbox/core';
import type { OnlinePaymentMethod, RequestContext } from '@nennbox/core';
import type { ApiDeps } from '../types.js';

export type InvoiceCheckoutResult =
  | { readonly status: 201; readonly url: string }
  | { readonly status: 400 | 404 | 503 };

/**
 * Which payment methods a checkout offers: a fixed list, or the methods the
 * organizer enabled for the event (optionally narrowed by the payer).
 */
export type InvoiceCheckoutMethods =
  | { readonly kind: 'fixed'; readonly methods: readonly OnlinePaymentMethod[] }
  | {
      readonly kind: 'configured';
      readonly requested?: readonly OnlinePaymentMethod[];
    };

export interface InvoiceCheckoutOptions {
  readonly methods?: InvoiceCheckoutMethods;
  /** Adds the invoice id to the return URLs so the page can confirm that payment. */
  readonly referenceInvoice?: boolean;
}

/** Without an explicit choice a checkout offers what the organizer enabled for the event. */
const standardMethods: InvoiceCheckoutMethods = { kind: 'configured' };

/** Whether this deployment can start an online payment at all. */
export const onlinePaymentConfigured = (deps: ApiDeps): boolean =>
  Boolean(
    deps.paymentProvider && deps.checkoutRepository && deps.paymentReturnOrigin,
  );

/**
 * Creates a provider checkout for the open balance of one invoice. The amount
 * and return origin come from the ledger and canonical origin, never the request.
 */
export async function createInvoiceCheckout(
  deps: ApiDeps,
  requestContext: RequestContext,
  invoiceId: string,
  returnPath: (eventSlug: string) => string,
  options: InvoiceCheckoutOptions = {},
): Promise<InvoiceCheckoutResult> {
  if (!deps.paymentProvider || !deps.checkoutRepository) return { status: 503 };
  if (!deps.paymentReturnOrigin) return { status: 503 };
  const origin = await resolveCanonicalOrigin(deps.paymentReturnOrigin, {
    deploymentMode: requestContext.deploymentMode,
    organizationId: requestContext.organizationId,
  });
  if (!origin) return { status: 503 };
  const invoice = await deps.checkoutRepository.get(requestContext, invoiceId);
  if (
    !invoice ||
    invoice.status === 'cancelled' ||
    invoice.status === 'paid' ||
    invoice.totalCents <= invoice.paidCents
  )
    return { status: 404 };
  const selection = options.methods ?? standardMethods;
  const paymentMethods =
    selection.kind === 'fixed'
      ? selection.methods
      : (selection.requested ?? invoice.paymentMethods);
  if (
    !paymentMethods.length ||
    (selection.kind === 'configured' &&
      paymentMethods.some((method) => !invoice.paymentMethods.includes(method)))
  )
    return { status: 400 };
  const returnUrl = (outcome: 'success' | 'cancelled') =>
    `${origin}${returnPath(invoice.eventSlug)}?payment=${outcome}${
      options.referenceInvoice
        ? `&invoice=${encodeURIComponent(invoice.id)}`
        : ''
    }`;
  const amountCents = invoice.totalCents - invoice.paidCents;
  // "Pay later": an unpaid checkout for the same amount is resumed, not duplicated.
  if (
    invoice.pendingSession &&
    invoice.pendingSession.amountCents === amountCents
  )
    return { status: 201, url: invoice.pendingSession.url };
  try {
    const session = await deps.paymentProvider.createCheckoutSession({
      organizationId: requestContext.organizationId,
      invoiceId: invoice.id,
      // The sequence keeps a replacement for a cancelled or expired checkout from
      // being answered with the provider's cached, dead session.
      idempotencyKey: `checkout:${invoice.id}:${amountCents}:${invoice.sessionCount}`,
      amountCents,
      currency: invoice.currency,
      description: `Nennung ${invoice.eventSlug}`,
      successUrl: returnUrl('success'),
      cancelUrl: returnUrl('cancelled'),
      paymentMethods,
    });
    await deps.checkoutRepository.createSession(requestContext, invoice.id, {
      id: session.id,
      url: session.url,
      amountCents,
      expiresAt: session.expiresAt ?? null,
    });
    return { status: 201, url: session.url };
  } catch {
    return { status: 503 };
  }
}

export type CancelCheckoutResult =
  'cancelled' | 'nothing_pending' | 'unavailable';

/**
 * "Zahlung abbrechen": ends every unpaid checkout of the invoice at the provider,
 * then marks it locally. A checkout that was paid in the meantime stays paid;
 * the provider refuses to expire it and the call reports 'unavailable'.
 */
export async function cancelInvoiceCheckout(
  deps: ApiDeps,
  requestContext: RequestContext,
  invoiceId: string,
): Promise<CancelCheckoutResult> {
  if (!deps.paymentProvider || !deps.checkoutRepository) return 'unavailable';
  const pending = await deps.checkoutRepository.pendingSessions(
    requestContext,
    invoiceId,
  );
  if (!pending.length) return 'nothing_pending';
  try {
    for (const session of pending)
      await deps.paymentProvider.expireCheckoutSession({
        organizationId: requestContext.organizationId,
        sessionId: session.id,
      });
  } catch (error) {
    deps.logger.warn('Stripe checkout could not be cancelled', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return 'unavailable';
  }
  await deps.checkoutRepository.markSessionsExpired(
    requestContext,
    invoiceId,
    pending.map((session) => session.id),
  );
  return 'cancelled';
}
