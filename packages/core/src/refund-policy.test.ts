import { describe, expect, it, vi } from 'vitest';
import {
  AUTOMATIC_REFUND_ACTOR,
  refundDueCents,
  daysBeforeEvent,
  errorCodeOf,
  disabledRefundPolicy,
  organizationId,
  refundPercent,
  refundShareCents,
  RefundRejectedError,
  settleCancellationRefund,
} from './index.js';
import type {
  ClaimedRefundIntent,
  PaymentProvider,
  PaymentRefundRepository,
  RefundReservation,
  RefundReservationRequest,
  RefundIntentRepository,
  RefundPolicy,
  RequestContext,
} from './index.js';

const policy: RefundPolicy = {
  enabled: true,
  tiers: [
    { daysBefore: 14, percent: 50 },
    { daysBefore: 28, percent: 100 },
    { daysBefore: 7, percent: 25 },
  ],
  rejectedPercent: 100,
};
const at = (iso: string) => new Date(iso);

describe('refund policy', () => {
  it('counts whole days up to the start of the event day', () => {
    expect(daysBeforeEvent(at('2030-06-01T12:00:00Z'), '2030-06-15')).toBe(13);
    expect(daysBeforeEvent(at('2030-06-01T00:00:00Z'), '2030-06-15')).toBe(14);
    expect(daysBeforeEvent(at('2030-06-16T00:00:00Z'), '2030-06-15')).toBe(-1);
  });

  it.each([
    ['2030-05-01T00:00:00Z', 100],
    ['2030-05-18T00:00:00Z', 100],
    ['2030-05-19T00:00:00Z', 50],
    ['2030-06-01T00:00:00Z', 50],
    ['2030-06-02T00:00:00Z', 25],
    ['2030-06-08T00:00:00Z', 25],
    ['2030-06-09T00:00:00Z', 0],
    ['2030-06-20T00:00:00Z', 0],
  ])('picks the tier that applies %s → %i %%', (cancelledAt, percent) => {
    expect(
      refundPercent(policy, 'withdrawn', at(cancelledAt), '2030-06-15'),
    ).toBe(percent);
  });

  it('refunds nothing when the rule is off, and the configured share when an entry is rejected', () => {
    expect(
      refundPercent(
        disabledRefundPolicy,
        'rejected',
        at('2030-06-14T00:00:00Z'),
        '2030-06-15',
      ),
    ).toBe(0);
    expect(
      refundPercent(
        { ...policy, rejectedPercent: 80 },
        'rejected',
        at('2030-06-14T00:00:00Z'),
        '2030-06-15',
      ),
    ).toBe(80);
  });

  it('rounds the refunded share down to whole cents', () => {
    expect(refundShareCents(1001, 50)).toBe(500);
    expect(refundShareCents(4200, 33)).toBe(1386);
    expect(refundShareCents(4200, 0)).toBe(0);
  });
});

describe('refund due on a partly refunded payment', () => {
  it('takes the share from what was paid, not from what is left', () => {
    // 100,00 paid, 50,00 refunded by hand, rule 50 %: the 50 % are already given back.
    expect(refundDueCents(10_000, 5_000, 50)).toBe(0);
    // Rule 80 %: 30,00 are still owed.
    expect(refundDueCents(10_000, 5_000, 80)).toBe(3_000);
    // Never more than what can still be refunded.
    expect(refundDueCents(10_000, 1_000, 100)).toBe(1_000);
    // Nothing refunded yet: plain share, rounded down.
    expect(refundDueCents(10_001, 10_001, 50)).toBe(5_000);
    expect(refundDueCents(10_000, 0, 100)).toBe(0);
  });
});

describe('settling a cancellation refund', () => {
  const ctx = {
    organizationId: organizationId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  } as RequestContext;
  const intent: ClaimedRefundIntent = {
    id: 'intent-1',
    invoiceId: 'invoice-1',
    trigger: 'withdrawn',
    cancelledAt: at('2030-06-01T00:00:00Z'),
    eventStartsOn: '2030-06-15',
    policy,
    payments: [
      {
        invoiceId: 'invoice-1',
        providerPaymentId: 'pi_1',
        refundableCents: 3000,
        paidCents: 3000,
        currency: 'EUR',
      },
      {
        invoiceId: 'invoice-1',
        providerPaymentId: 'pi_2',
        refundableCents: 1200,
        paidCents: 1200,
        currency: 'EUR',
      },
    ],
  };
  function setup(
    options: { refundFails?: boolean; ledger?: 'recorded' | null } = {},
  ) {
    const finish = vi.fn(async () => {});
    const intents: RefundIntentRepository = {
      cancelledInvoiceForEntry: async () => 'invoice-1',
      closeIfReactivated: async () => {},
      staleInvoiceIds: async () => [],
      claim: vi.fn(async () => intent),
      finish,
    };
    const recordRefund = vi.fn(async () =>
      options.ledger === undefined ? ('recorded' as const) : options.ledger,
    );
    const reserve = vi.fn(
      async (
        _ctx: RequestContext,
        request: RefundReservationRequest,
      ): Promise<RefundReservation> => ({
        status: 'reserved',
        invoiceId: request.invoiceId,
        providerPaymentId: request.providerPaymentId,
        idempotencyKey: request.idempotencyKey,
        amountCents: request.providerPaymentId === 'pi_1' ? 1500 : 600,
        currency: 'EUR',
      }),
    );
    const refunds: PaymentRefundRepository = {
      getRefundable: async () => null,
      reserve,
      recordRefund,
    };
    const refund = vi.fn(async (request: { idempotencyKey: string }) => {
      if (options.refundFails) throw new Error('stripe down');
      return { id: `re_${request.idempotencyKey}` };
    });
    const provider = { refund } as unknown as PaymentProvider;
    return {
      intents,
      refunds,
      provider,
      finish,
      recordRefund,
      reserve,
      refund,
    };
  }

  it('refunds the share of every online payment with keys derived from the intent and records them as the system', async () => {
    const s = setup();
    const result = await settleCancellationRefund(ctx, 'invoice-1', s);
    expect(result).toEqual({
      status: 'done',
      percent: 50,
      refundedCents: 2100,
      failure: null,
    });
    expect(s.reserve).toHaveBeenCalledTimes(2);
    expect(s.reserve).toHaveBeenCalledWith(ctx, {
      invoiceId: 'invoice-1',
      providerPaymentId: 'pi_1',
      idempotencyKey: 'auto-refund:intent-1:pi_1',
      source: { kind: 'automatic', intentId: 'intent-1', percent: 50 },
    });
    expect(s.reserve.mock.invocationCallOrder[0]!).toBeLessThan(
      s.refund.mock.invocationCallOrder[0]!,
    );
    expect(s.refund).toHaveBeenCalledTimes(2);
    expect(s.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'auto-refund:intent-1:pi_1',
        organizationId: ctx.organizationId,
        paymentId: 'pi_1',
        amountCents: 1500,
      }),
    );
    expect(s.recordRefund).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        providerPaymentId: 'pi_2',
        amountCents: 600,
        actor: AUTOMATIC_REFUND_ACTOR,
        reservationKey: 'auto-refund:intent-1:pi_2',
        reason: expect.stringContaining('50 %'),
      }),
    );
    expect(s.finish).toHaveBeenCalledWith(ctx, 'intent-1', result);
  });

  it('stores a provider failure on the intent instead of throwing, and reports what already went through', async () => {
    const s = setup({ refundFails: true });
    const result = await settleCancellationRefund(ctx, 'invoice-1', s);
    expect(result).toEqual({
      status: 'failed',
      percent: 50,
      refundedCents: 0,
      failure: 'provider_unavailable',
    });
    expect(s.finish).toHaveBeenCalledOnce();
  });

  it('counts an unclassified provider failure and reports needs_review once the limit is reached', async () => {
    const s = setup({ refundFails: true });
    const recordFailedAttempt = vi
      .fn()
      .mockResolvedValueOnce('retry')
      .mockResolvedValueOnce('needs_review');
    const refunds = { ...s.refunds, recordFailedAttempt };
    expect(
      await settleCancellationRefund(ctx, 'invoice-1', { ...s, refunds }),
    ).toMatchObject({ failure: 'provider_unavailable' });
    expect(
      await settleCancellationRefund(ctx, 'invoice-1', { ...s, refunds }),
    ).toMatchObject({ status: 'failed', failure: 'needs_review' });
    expect(recordFailedAttempt).toHaveBeenCalledWith(
      ctx,
      'auto-refund:intent-1:pi_1',
      'Error',
    );
  });

  it('releases a definitively rejected refund instead of counting an attempt', async () => {
    const s = setup();
    s.refund.mockRejectedValueOnce(
      new RefundRejectedError('charge_already_refunded'),
    );
    const rejectReservation = vi.fn(async () => {});
    const recordFailedAttempt = vi.fn();
    const refunds = { ...s.refunds, rejectReservation, recordFailedAttempt };
    expect(
      await settleCancellationRefund(ctx, 'invoice-1', { ...s, refunds }),
    ).toMatchObject({ failure: 'provider_rejected' });
    expect(rejectReservation).toHaveBeenCalledWith(
      ctx,
      'auto-refund:intent-1:pi_1',
    );
    expect(recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('names a provider error by its short code, never by its message', () => {
    expect(
      errorCodeOf(Object.assign(new Error('secret detail'), { code: 'weird' })),
    ).toBe('weird');
    expect(errorCodeOf(new TypeError('secret detail'))).toBe('TypeError');
    expect(errorCodeOf('x')).toBe('unknown');
  });

  it('marks a refund the ledger rejected as failed so the organizer sees it', async () => {
    const s = setup({ ledger: null });
    expect(await settleCancellationRefund(ctx, 'invoice-1', s)).toMatchObject({
      status: 'failed',
      failure: 'ledger_rejected',
    });
  });

  it('skips without calling the provider when the rule gives nothing back', async () => {
    const s = setup();
    s.intents.claim = vi.fn(async () => ({
      ...intent,
      cancelledAt: at('2030-06-14T00:00:00Z'),
    }));
    expect(await settleCancellationRefund(ctx, 'invoice-1', s)).toMatchObject({
      status: 'skipped',
      percent: 0,
    });
    expect(s.refund).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
  });

  it('does nothing when no intent is waiting', async () => {
    const s = setup();
    s.intents.claim = vi.fn(async () => null);
    expect(await settleCancellationRefund(ctx, 'invoice-1', s)).toBeNull();
    expect(s.finish).not.toHaveBeenCalled();
  });

  it('refunds nothing more when the organizer already refunded the share by hand', async () => {
    const s = setup();
    s.intents.claim = vi.fn(async () => ({
      ...intent,
      payments: [
        {
          invoiceId: 'invoice-1',
          providerPaymentId: 'pi_1',
          paidCents: 10_000,
          refundableCents: 5_000,
          currency: 'EUR',
        },
      ],
    }));
    s.reserve.mockResolvedValue({ status: 'nothing_due' });
    const result = await settleCancellationRefund(ctx, 'invoice-1', s);
    expect(result).toEqual({
      status: 'done',
      percent: 50,
      refundedCents: 0,
      failure: null,
    });
    expect(s.reserve).toHaveBeenCalledWith(ctx, {
      invoiceId: 'invoice-1',
      providerPaymentId: 'pi_1',
      idempotencyKey: 'auto-refund:intent-1:pi_1',
      source: { kind: 'automatic', intentId: 'intent-1', percent: 50 },
    });
    expect(s.refund).not.toHaveBeenCalled();
    expect(s.recordRefund).not.toHaveBeenCalled();
  });

  it('uses the locked reservation amount rather than the claimed payment snapshot', async () => {
    const s = setup();
    s.reserve.mockResolvedValueOnce({
      status: 'reserved',
      invoiceId: 'invoice-1',
      providerPaymentId: 'pi_1',
      idempotencyKey: 'auto-refund:intent-1:pi_1',
      amountCents: 250,
      currency: 'EUR',
    });
    expect(await settleCancellationRefund(ctx, 'invoice-1', s)).toEqual({
      status: 'done',
      percent: 50,
      refundedCents: 850,
      failure: null,
    });
    expect(s.refund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pi_1', amountCents: 250 }),
    );
    expect(s.recordRefund).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        providerPaymentId: 'pi_1',
        amountCents: 250,
        reservationKey: 'auto-refund:intent-1:pi_1',
      }),
    );
  });
});
