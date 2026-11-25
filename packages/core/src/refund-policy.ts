import { RefundRejectedError } from './payment-provider.js';
import type { RequestContext } from './context.js';
import type {
  PaymentProvider,
  PaymentRefundRepository,
  RefundablePayment,
} from './payment-provider.js';

export type RefundTrigger = 'withdrawn' | 'rejected';

export interface RefundPolicyTier {
  /** The tier applies when the cancellation is at least this many days before the event. */
  readonly daysBefore: number;
  readonly percent: number;
}

/**
 * Configurable refund rule of an organization or event ("up to X days before the
 * event Y %"). Disabled by default; an organizer who never configures it keeps
 * refunding by hand.
 */
export interface RefundPolicy {
  readonly enabled: boolean;
  readonly tiers: readonly RefundPolicyTier[];
  /** Share refunded when the organizer declines an entry, regardless of timing. */
  readonly rejectedPercent: number;
}

export const disabledRefundPolicy: RefundPolicy = {
  enabled: false,
  tiers: [],
  rejectedPercent: 100,
};

const DAY_MS = 86_400_000;

/** Whole days from the cancellation instant to the start of the event day (UTC). */
export function daysBeforeEvent(
  cancelledAt: Date,
  eventStartsOn: string,
): number {
  const start = Date.parse(`${eventStartsOn.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start)) throw new Error('Invalid event start date');
  return Math.floor((start - cancelledAt.getTime()) / DAY_MS);
}

/** Percent of the paid amount to give back; 0 when the rule is off or no tier matches. */
export function refundPercent(
  policy: RefundPolicy,
  trigger: RefundTrigger,
  cancelledAt: Date,
  eventStartsOn: string,
): number {
  if (!policy.enabled) return 0;
  if (trigger === 'rejected') return policy.rejectedPercent;
  const days = daysBeforeEvent(cancelledAt, eventStartsOn);
  const match = [...policy.tiers]
    .sort((a, b) => b.daysBefore - a.daysBefore)
    .find((tier) => days >= tier.daysBefore);
  return match?.percent ?? 0;
}

/** Rounds down, so the organizer never gives back more than the rule says. */
export function refundShareCents(
  refundableCents: number,
  percent: number,
): number {
  return Math.floor((refundableCents * percent) / 100);
}

/** An online payment of the invoice with what was received and what can still be given back. */
export interface IntentPayment extends RefundablePayment {
  /** Gross amount received for this payment, before any refund. */
  readonly paidCents: number;
}

export function refundDueCents(
  paidCents: number,
  refundableCents: number,
  percent: number,
): number {
  const alreadyRefunded = paidCents - refundableCents;
  return Math.max(
    0,
    Math.min(
      refundShareCents(paidCents, percent) - alreadyRefunded,
      refundableCents,
    ),
  );
}

export interface ClaimedRefundIntent {
  readonly id: string;
  readonly invoiceId: string;
  readonly trigger: RefundTrigger;
  readonly cancelledAt: Date;
  readonly eventStartsOn: string;
  readonly policy: RefundPolicy;
  readonly payments: readonly IntentPayment[];
}

export interface RefundIntentResult {
  readonly status: 'done' | 'failed' | 'skipped';
  readonly percent: number | null;
  readonly refundedCents: number;
  /** Short machine-readable reason, never provider payloads or personal data. */
  readonly failure: string | null;
}

export interface RefundIntentRepository {
  /**
   * Invoice of the entry's registration group when every entry of the group is
   * withdrawn or rejected, with or without a refund intent; null otherwise.
   */
  cancelledInvoiceForEntry(
    ctx: RequestContext,
    entryId: string,
  ): Promise<string | null>;
  /**
   * Called after a status change: when the entry's group takes part again, waiting
   * intents of its invoice are closed. A refund already reserved is dealt with when it resumes.
   */
  closeIfReactivated(ctx: RequestContext, entryId: string): Promise<void>;
  /** Invoices whose intent waits or was taken but not finished for longer than the retry delay. */
  staleInvoiceIds(ctx: RequestContext): Promise<readonly string[]>;
  /**
   * Takes the open intent of the invoice, if any, and marks it as in progress;
   * null when nothing is waiting. An intent held for longer than the retry delay
   * can be taken again, so a crash never leaves a refund stuck.
   */
  claim(
    ctx: RequestContext,
    invoiceId: string,
  ): Promise<ClaimedRefundIntent | null>;
  finish(
    ctx: RequestContext,
    intentId: string,
    result: RefundIntentResult,
  ): Promise<void>;
}

const failed = (
  percent: number,
  refundedCents: number,
  failure: string,
): RefundIntentResult => ({
  status: 'failed',
  percent,
  refundedCents,
  failure,
});

/** A short, payload-free code for the failure log of a reserved refund. */
export function errorCodeOf(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  const text =
    typeof code === 'string' && code
      ? code
      : error instanceof Error
        ? error.name
        : 'unknown';
  return text.slice(0, 80);
}

export const AUTOMATIC_REFUND_ACTOR = 'system:refund-policy';

/**
 * Gives back the configured share of every online payment of a cancelled entry.
 * Idempotent: provider calls use keys derived from the intent, and the ledger
 * ignores a refund id it has already recorded.
 */
export async function settleCancellationRefund(
  ctx: RequestContext,
  invoiceId: string,
  deps: {
    intents: RefundIntentRepository;
    refunds: PaymentRefundRepository;
    provider: PaymentProvider;
  },
): Promise<RefundIntentResult | null> {
  const intent = await deps.intents.claim(ctx, invoiceId);
  if (!intent) return null;
  const percent = refundPercent(
    intent.policy,
    intent.trigger,
    intent.cancelledAt,
    intent.eventStartsOn,
  );
  let refundedCents = 0;
  let result: RefundIntentResult;
  if (percent <= 0) {
    result = { status: 'skipped', percent, refundedCents, failure: null };
  } else {
    let stopped: RefundIntentResult | null = null;
    let operationKey: string | null = null;
    try {
      for (const payment of intent.payments) {
        // The amount is decided inside the invoice lock, from the ledger and from
        // what other refunds reserved; the claim's snapshot only names the payments.
        const reservation = await deps.refunds.reserve(ctx, {
          invoiceId: intent.invoiceId,
          providerPaymentId: payment.providerPaymentId,
          idempotencyKey: `auto-refund:${intent.id}:${payment.providerPaymentId}`,
          source: { kind: 'automatic', intentId: intent.id, percent },
        });
        if (reservation.status === 'nothing_due') continue;
        if (reservation.status === 'completed') continue;
        if (reservation.status === 'reactivated') {
          stopped =
            refundedCents > 0
              ? failed(percent, refundedCents, 'reactivated_during_refund')
              : {
                  status: 'skipped',
                  percent,
                  refundedCents,
                  failure: 'registration_reactivated',
                };
          break;
        }
        if (reservation.status === 'needs_review') {
          stopped = failed(percent, refundedCents, 'reactivated_during_refund');
          break;
        }
        if (reservation.status !== 'reserved')
          throw new Error('ledger_rejected');
        const reason = `Automatische Erstattung (${percent} %) bei ${
          intent.trigger === 'withdrawn'
            ? 'Absage durch den Fahrer'
            : 'Ablehnung'
        }`;
        operationKey = reservation.idempotencyKey;
        const refund = await deps.provider.refund({
          idempotencyKey: reservation.idempotencyKey,
          organizationId: ctx.organizationId,
          invoiceId: intent.invoiceId,
          paymentId: reservation.providerPaymentId,
          amountCents: reservation.amountCents,
          reason,
        });
        const recorded = await deps.refunds.recordRefund(ctx, {
          invoiceId: reservation.invoiceId,
          providerPaymentId: reservation.providerPaymentId,
          refundableCents: payment.refundableCents,
          currency: reservation.currency,
          amountCents: reservation.amountCents,
          providerRefundId: refund.id,
          actor: AUTOMATIC_REFUND_ACTOR,
          reason,
          reservationKey: reservation.idempotencyKey,
        });
        if (!recorded) throw new Error('ledger_rejected');
        refundedCents += reservation.amountCents;
      }
      result = stopped ?? {
        status: 'done',
        percent,
        refundedCents,
        failure: null,
      };
    } catch (error) {
      let needsReview = false;
      if (operationKey) {
        if (error instanceof RefundRejectedError)
          await deps.refunds.rejectReservation?.(ctx, operationKey);
        else
          needsReview =
            (await deps.refunds.recordFailedAttempt?.(
              ctx,
              operationKey,
              errorCodeOf(error),
            )) === 'needs_review';
      }
      result = failed(
        percent,
        refundedCents,
        needsReview
          ? 'needs_review'
          : error instanceof Error && error.message === 'ledger_rejected'
            ? 'ledger_rejected'
            : error instanceof RefundRejectedError
              ? 'provider_rejected'
              : 'provider_unavailable',
      );
    }
  }
  await deps.intents.finish(ctx, intent.id, result);
  return result;
}
