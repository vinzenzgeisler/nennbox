import { resolveCanonicalOrigin } from '@racepilot/core';
import type { RequestContext } from '@racepilot/core';
import type { ApiDeps } from '../types.js';

export type InvoiceCheckoutResult =
  | { readonly status: 201; readonly url: string }
  | { readonly status: 404 | 503 };

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
  try {
    const session = await deps.paymentProvider.createCheckoutSession({
      organizationId: requestContext.organizationId,
      invoiceId: invoice.id,
      idempotencyKey: `checkout:${invoice.id}:${invoice.totalCents - invoice.paidCents}`,
      amountCents: invoice.totalCents - invoice.paidCents,
      currency: invoice.currency,
      description: `Nennung ${invoice.eventSlug}`,
      successUrl: `${origin}${returnPath(invoice.eventSlug)}?payment=success`,
      cancelUrl: `${origin}${returnPath(invoice.eventSlug)}?payment=cancelled`,
      paymentMethods: ['card', 'sepa_debit'],
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
