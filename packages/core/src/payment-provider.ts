import type { OrganizationId } from './context.js';

export type OnlinePaymentMethod = 'card' | 'sepa_debit' | 'paypal' | 'klarna';

export interface CheckoutSessionRequest {
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly idempotencyKey: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly description: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly paymentMethods: readonly OnlinePaymentMethod[];
  readonly expiresAt?: string;
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
  /** ISO instant after which the provider no longer accepts payment, when known. */
  readonly expiresAt?: string | null;
}

export interface CheckoutSessionExpiryRequest {
  readonly organizationId: OrganizationId;
  readonly sessionId: string;
}

/**
 * Provider-neutral outcome of one signed provider notification. `organizationId`
 * is resolved by the adapter (Community: from the metadata it wrote itself;
 * Cloud: from the connected account that sent the event) and must never be taken
 * from an unsigned field. `accountId` names the provider account that emitted it.
 */
export type PaymentProviderEvent =
  | {
      readonly id: string;
      readonly organizationId: OrganizationId;
      readonly invoiceId: string;
      readonly sessionId?: string;
      readonly accountId?: string;
      readonly type: 'succeeded';
      readonly amountCents: number;
      readonly currency: string;
      readonly paymentId: string;
    }
  | {
      readonly id: string;
      readonly organizationId: OrganizationId;
      readonly invoiceId: string;
      readonly sessionId?: string;
      readonly accountId?: string;
      readonly type: 'failed' | 'expired';
      readonly amountCents: number;
      readonly currency: string;
      readonly paymentId: string | null;
    };

export interface PaymentRefundRequest {
  readonly idempotencyKey: string;
  readonly organizationId: OrganizationId;
  readonly invoiceId: string;
  readonly paymentId: string;
  readonly amountCents: number;
  readonly reason: string;
}

/**
 * Provider boundary; implementations resolve account credentials outside the
 * domain model. Every call that moves money carries `organizationId`, so an
 * account-aware implementation (Stripe Connect: one connected account per
 * organization, selected through the Stripe-Account header) resolves the account
 * per call without any change to the port. See docs/architecture/payments.md.
 */
export interface PaymentProvider {
  createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<CheckoutSession>;
  /**
   * Ends an unpaid checkout so its link stops working ("Zahlung abbrechen").
   * Resolves `completed` when the payer already paid it: such a session must
   * never be replaced, the payment is booked by its webhook instead.
   */
  expireCheckoutSession(
    request: CheckoutSessionExpiryRequest,
  ): Promise<'expired' | 'completed'>;
  /**
   * Verifies the signature and maps the notification to a domain event. Throws
   * when the signature or the event content is invalid. Returns null for an
   * authentic notification that carries nothing to apply (unrelated event type,
   * or an asynchronous payment that is still pending).
   */
  verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<PaymentProviderEvent | null>;
  refund(request: PaymentRefundRequest): Promise<{ readonly id: string }>;
}

export interface PendingCheckoutSession {
  readonly id: string;
  readonly url: string;
  /** Null for sessions created before the amount was stored. */
  readonly amountCents: number | null;
  /** Methods the session offers; null for sessions created before they were stored. */
  readonly paymentMethods: readonly OnlinePaymentMethod[] | null;
  readonly expiresAt: string | null;
}

export interface CheckoutInvoice {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly eventId: string;
  readonly eventSlug: string;
  readonly paymentMethods: readonly OnlinePaymentMethod[];
  readonly totalCents: number;
  readonly paidCents: number;
  readonly currency: string;
  readonly status: 'open' | 'partially_paid' | 'paid' | 'cancelled';
  /** Newest unpaid checkout of this invoice that the provider still accepts. */
  readonly pendingSession: PendingCheckoutSession | null;
  /** Every checkout of this invoice that is not finished locally, newest first. */
  readonly openSessions: readonly PendingCheckoutSession[];
  /** Every entry of the registration group is withdrawn or rejected: nothing left to pay. */
  readonly allEntriesCancelled: boolean;
  /** Checkouts ever created for this invoice; keeps provider idempotency keys distinct. */
  readonly sessionCount: number;
  readonly checkoutLifetimeMinutes?: number;
}

export type ProviderEventResult =
  'applied' | 'applied_with_mismatch' | 'duplicate' | 'not_found';

export interface CheckoutRepository {
  /** Serialize checkout creation across processes using the invoice row lock. */
  withInvoiceLock?<T>(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
    run: (repository: CheckoutRepository) => Promise<T>,
  ): Promise<T>;
  get(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
  ): Promise<CheckoutInvoice | null>;
  createSession(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
    session: {
      readonly id: string;
      readonly url: string;
      readonly amountCents: number;
      readonly paymentMethods: readonly OnlinePaymentMethod[];
      readonly expiresAt: string | null;
    },
  ): Promise<void>;
  /** Unpaid checkouts of the invoice, newest first. */
  pendingSessions(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
  ): Promise<readonly { readonly id: string }[]>;
  markSessionsExpired(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
    sessionIds: readonly string[],
  ): Promise<void>;
  applyProviderEvent(event: PaymentProviderEvent): Promise<ProviderEventResult>;
}

export interface RefundablePayment {
  readonly invoiceId: string;
  readonly providerPaymentId: string;
  readonly refundableCents: number;
  readonly currency: string;
}

export interface PaymentRefundRepository {
  getRefundable(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
    providerPaymentId: string,
  ): Promise<RefundablePayment | null>;
  recordRefund(
    ctx: import('./context.js').RequestContext,
    input: RefundablePayment & {
      amountCents: number;
      providerRefundId: string;
      actor: string;
      reason: string;
    },
  ): Promise<'recorded' | 'duplicate' | null>;
}
