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

/**
 * What reserving a refund under the invoice lock decided. A reservation fixes
 * the amount and the provider idempotency key: a retry resumes the same
 * operation instead of computing a new amount from a stale snapshot.
 */
export type RefundUnavailableReason =
  | 'exceeds_available'
  | 'invalid_amount'
  | 'invoice_not_found'
  | 'key_conflict'
  | 'closed';

export type RefundReservation =
  | {
      readonly status: 'reserved';
      readonly invoiceId: string;
      readonly providerPaymentId: string;
      readonly idempotencyKey: string;
      readonly amountCents: number;
      readonly currency: string;
    }
  /** Same operation already booked in the ledger; nothing to do any more. */
  | {
      readonly status: 'completed';
      readonly amountCents: number;
      readonly providerRefundId: string | null;
    }
  /** Automatic: the rule's share is already given back or reserved. */
  | { readonly status: 'nothing_due' }
  /**
   * The refund cannot be reserved. `reason` tells the organizer why:
   * `exceeds_available` (more than collected minus refunded minus reserved,
   * with `availableCents` left), `invalid_amount`, `invoice_not_found`,
   * `key_conflict` (the key belongs to another operation) or `closed`
   * (the operation was rejected by the provider or abandoned by the office).
   */
  | {
      readonly status: 'unavailable';
      readonly reason: RefundUnavailableReason;
      readonly availableCents?: number;
    }
  /** Automatic: the group takes part again (or the intent was withdrawn); no money moved. */
  | { readonly status: 'reactivated' }
  /**
   * Automatic: the registration took part again while a reserved refund may
   * already be running at the provider. It is not resumed; the organizer settles it.
   */
  | { readonly status: 'needs_review' };

export interface RefundReservationRequest {
  readonly invoiceId: string;
  readonly providerPaymentId: string;
  readonly idempotencyKey: string;
  /** Manual: exactly this amount. Automatic: derived from the rule inside the lock. */
  readonly source:
    | {
        readonly kind: 'manual';
        readonly amountCents: number;
        readonly actor?: string;
        readonly reason?: string;
      }
    | {
        readonly kind: 'automatic';
        readonly intentId: string;
        readonly percent: number;
      };
}

/** A reserved refund the provider could not settle repeatedly; the office has to resolve it. */
export const MAX_REFUND_ATTEMPTS = 5;

export interface PaymentRefundRepository {
  /** Release only a provider-confirmed rejected operation, never an ambiguous failure. */
  rejectReservation?(
    ctx: import('./context.js').RequestContext,
    key: string,
  ): Promise<void>;
  /**
   * Counts a failed attempt that is not a definitive rejection. After
   * `MAX_REFUND_ATTEMPTS` the reservation is flagged for review and no longer
   * retried automatically; it keeps blocking its amount and a reactivation.
   */
  recordFailedAttempt?(
    ctx: import('./context.js').RequestContext,
    key: string,
    errorCode: string,
  ): Promise<'retry' | 'needs_review'>;
  /**
   * Office decision for a reservation flagged for review: the refund did not
   * happen at the provider, so the amount is released. Audited with actor and reason.
   */
  abandonReservation?(
    ctx: import('./context.js').RequestContext,
    request: { invoiceId: string; key: string; actor: string; reason: string },
  ): Promise<'abandoned' | 'not_found' | 'not_reviewable'>;
  getRefundable(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
    providerPaymentId: string,
  ): Promise<RefundablePayment | null>;
  /**
   * Reserves a refund atomically per invoice: what the rule allows, what was
   * already refunded and what other refunds reserved are computed inside the
   * same invoice lock the ledger booking uses. Every refund, manual or
   * automatic, must reserve before it calls the provider.
   */
  reserve(
    ctx: import('./context.js').RequestContext,
    request: RefundReservationRequest,
  ): Promise<RefundReservation>;
  recordRefund(
    ctx: import('./context.js').RequestContext,
    input: RefundablePayment & {
      amountCents: number;
      providerRefundId: string;
      actor: string;
      reason: string;
      /** Idempotency key of the reservation this refund fulfils; completed in the same transaction. */
      reservationKey?: string;
    },
  ): Promise<'recorded' | 'duplicate' | null>;
}

/** Only throw after the provider authoritatively confirms that no refund succeeded. */
export class RefundRejectedError extends Error {
  /** Short provider error code (never a payload), when the provider named one. */
  readonly code: string | undefined;
  constructor(code?: string) {
    super('Refund definitively rejected');
    this.name = 'RefundRejectedError';
    this.code = code;
  }
}
