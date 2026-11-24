import { describe, expect, it, vi } from 'vitest';
import {
  AUTOMATIC_REFUND_ACTOR,
  daysBeforeEvent,
  disabledRefundPolicy,
  organizationId,
  refundPercent,
  refundShareCents,
  settleCancellationRefund,
} from './index.js';
import type {
  ClaimedRefundIntent,
  PaymentProvider,
  PaymentRefundRepository,
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
        currency: 'EUR',
      },
      {
        invoiceId: 'invoice-1',
        providerPaymentId: 'pi_2',
        refundableCents: 1200,
        currency: 'EUR',
      },
    ],
  };
  function setup(
    options: { refundFails?: boolean; ledger?: 'recorded' | null } = {},
  ) {
    const finish = vi.fn(async () => {});
    const intents: RefundIntentRepository = {
      openInvoiceForEntry: async () => 'invoice-1',
      claim: vi.fn(async () => intent),
      finish,
    };
    const recordRefund = vi.fn(async () =>
      options.ledger === undefined ? ('recorded' as const) : options.ledger,
    );
    const refunds = {
      getRefundable: async () => null,
      recordRefund,
    } as PaymentRefundRepository;
    const refund = vi.fn(async (request: { idempotencyKey: string }) => {
      if (options.refundFails) throw new Error('stripe down');
      return { id: `re_${request.idempotencyKey}` };
    });
    const provider = { refund } as unknown as PaymentProvider;
    return { intents, refunds, provider, finish, recordRefund, refund };
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
  });

  it('does nothing when no intent is waiting', async () => {
    const s = setup();
    s.intents.claim = vi.fn(async () => null);
    expect(await settleCancellationRefund(ctx, 'invoice-1', s)).toBeNull();
    expect(s.finish).not.toHaveBeenCalled();
  });
});
