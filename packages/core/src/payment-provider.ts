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
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
}

export type PaymentProviderEvent =
  | {
      readonly id: string;
      readonly organizationId: OrganizationId;
      readonly invoiceId: string;
      readonly type: 'succeeded';
      readonly amountCents: number;
      readonly currency: string;
      readonly paymentId: string;
    }
  | {
      readonly id: string;
      readonly organizationId: OrganizationId;
      readonly invoiceId: string;
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

/** Provider boundary; implementations resolve account credentials outside the domain model. */
export interface PaymentProvider {
  createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<CheckoutSession>;
  verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<PaymentProviderEvent>;
  refund(request: PaymentRefundRequest): Promise<{ readonly id: string }>;
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
}

export interface CheckoutRepository {
  get(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
  ): Promise<CheckoutInvoice | null>;
  createSession(
    ctx: import('./context.js').RequestContext,
    invoiceId: string,
    providerSessionId: string,
    url: string,
  ): Promise<void>;
  applyProviderEvent(
    event: PaymentProviderEvent,
  ): Promise<'applied' | 'duplicate' | 'not_found'>;
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
