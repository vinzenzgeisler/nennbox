import { resolveCanonicalOrigin } from '@nennbox/core';
import type { OnlinePaymentMethod, RequestContext } from '@nennbox/core';
import type { ApiDeps } from '../types.js';

export type InvoiceCheckoutResult =
  | { readonly status: 201; readonly url: string }
  /** 409: an earlier checkout of this invoice was paid or is being paid; no second one is opened. */
  | { readonly status: 400 | 404 | 409 | 503 };

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
  if (deps.checkoutRepository.withInvoiceLock)
    return deps.checkoutRepository.withInvoiceLock(
      requestContext,
      invoiceId,
      (repository) =>
        createInvoiceCheckout(
          { ...deps, checkoutRepository: repository },
          requestContext,
          invoiceId,
          returnPath,
          options,
        ),
    );
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
    invoice.allEntriesCancelled ||
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
  const now = Date.now();
  // "Pay later": an unpaid checkout that still matches amount and methods is resumed.
  const reusable = invoice.openSessions.find(
    (session) =>
      session.amountCents === amountCents &&
      session.paymentMethods !== null &&
      sameMethods(session.paymentMethods, paymentMethods) &&
      (!session.expiresAt || Date.parse(session.expiresAt) > now),
  );
  if (reusable) return { status: 201, url: reusable.url };
  // Anything else open would stay payable at the provider next to the new
  // checkout and could be paid twice, so it ends first. If one of them was
  // already paid, no second checkout is opened.
  const ended = await expireOpenCheckouts(
    deps,
    requestContext,
    invoice.id,
    invoice.openSessions.map((session) => session.id),
  );
  if (ended === 'completed') return { status: 409 };
  if (ended === 'unavailable') return { status: 503 };
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
      expiresAt: new Date(
        now + (invoice.checkoutLifetimeMinutes ?? 60) * 60_000,
      ).toISOString(),
    });
    await deps.checkoutRepository.createSession(requestContext, invoice.id, {
      id: session.id,
      url: session.url,
      amountCents,
      paymentMethods,
      expiresAt:
        session.expiresAt ??
        new Date(
          now + (invoice.checkoutLifetimeMinutes ?? 60) * 60_000,
        ).toISOString(),
    });
    return { status: 201, url: session.url };
  } catch (error) {
    deps.logger.warn('Stripe checkout could not be created', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return { status: 503 };
  }
}

const sameMethods = (
  a: readonly OnlinePaymentMethod[],
  b: readonly OnlinePaymentMethod[],
) => a.length === b.length && a.every((method) => b.includes(method));

export type ExpireCheckoutsResult = 'expired' | 'completed' | 'unavailable';

/**
 * Ends unpaid checkouts at the provider first and marks them locally only
 * afterwards. 'completed' means one of them was already paid: it stays as it is
 * (its webhook books the payment) and the caller must not open another one.
 */
export async function expireOpenCheckouts(
  deps: ApiDeps,
  requestContext: RequestContext,
  invoiceId: string,
  sessionIds: readonly string[],
): Promise<ExpireCheckoutsResult> {
  if (!deps.paymentProvider || !deps.checkoutRepository) return 'unavailable';
  const ended: string[] = [];
  let outcome: ExpireCheckoutsResult = 'expired';
  try {
    for (const sessionId of sessionIds) {
      const result = await deps.paymentProvider.expireCheckoutSession({
        organizationId: requestContext.organizationId,
        sessionId,
      });
      if (result === 'completed') outcome = 'completed';
      else ended.push(sessionId);
    }
  } catch (error) {
    deps.logger.warn('Stripe checkout could not be ended', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    outcome = 'unavailable';
  }
  if (ended.length)
    await deps.checkoutRepository.markSessionsExpired(
      requestContext,
      invoiceId,
      ended,
    );
  return outcome;
}

export type CancelCheckoutResult =
  'cancelled' | 'nothing_pending' | 'completed' | 'unavailable';

/**
 * "Zahlung abbrechen": ends every unpaid checkout of the invoice at the provider,
 * then marks it locally. A checkout that was paid in the meantime stays paid.
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
  const result = await expireOpenCheckouts(
    deps,
    requestContext,
    invoiceId,
    pending.map((session) => session.id),
  );
  return result === 'expired' ? 'cancelled' : result;
}
