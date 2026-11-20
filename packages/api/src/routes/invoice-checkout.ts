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

const standardMethods: InvoiceCheckoutMethods = {
  kind: 'fixed',
  methods: ['card', 'sepa_debit'],
};

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
  try {
    const session = await deps.paymentProvider.createCheckoutSession({
      organizationId: requestContext.organizationId,
      invoiceId: invoice.id,
      idempotencyKey: `checkout:${invoice.id}:${invoice.totalCents - invoice.paidCents}`,
      amountCents: invoice.totalCents - invoice.paidCents,
      currency: invoice.currency,
      description: `Nennung ${invoice.eventSlug}`,
      successUrl: returnUrl('success'),
      cancelUrl: returnUrl('cancelled'),
      paymentMethods,
    });
    await deps.checkoutRepository.createSession(
      requestContext,
      invoice.id,
      session.id,
      session.url,
    );
    return { status: 201, url: session.url };
  } catch {
    return { status: 503 };
  }
}
