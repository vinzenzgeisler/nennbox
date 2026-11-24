import { describe, expect, it, vi } from 'vitest';
import {
  defaultEntryWorkflow,
  organizationId,
  type CheckoutRepository,
  type ClaimedRefundIntent,
  type PaymentProvider,
  type PaymentRefundRepository,
  type RefundIntentRepository,
  type RefundReservation,
  type RefundReservationRequest,
  type RequestContext,
} from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps } from './testing.js';

const org = '11111111-1111-4111-8111-111111111111';
const revision = {
  id: 'revision-1',
  organizationId: organizationId(org),
  eventId: 'event-1',
  version: 1,
  workflow: defaultEntryWorkflow,
};
const claimed: ClaimedRefundIntent = {
  id: 'intent-1',
  invoiceId: 'invoice-1',
  trigger: 'withdrawn',
  cancelledAt: new Date('2030-06-01T00:00:00Z'),
  eventStartsOn: '2030-06-15',
  policy: {
    enabled: true,
    tiers: [{ daysBefore: 7, percent: 100 }],
    rejectedPercent: 100,
  },
  payments: [
    {
      invoiceId: 'invoice-1',
      providerPaymentId: 'pi_1',
      refundableCents: 4200,
      paidCents: 4200,
      currency: 'EUR',
    },
  ],
};

function makeApp(
  options: {
    sessionPaid?: boolean;
    intent?: boolean;
    unpaid?: boolean;
    providerFails?: boolean;
    configured?: boolean;
  } = {},
) {
  const refund = vi.fn(async () => {
    if (options.providerFails) throw new Error('stripe down');
    return { id: 're_1' };
  });
  const finish = vi.fn(async () => {});
  const warn = vi.fn();
  const closeIfReactivated = vi.fn(async () => {});
  const cancelledInvoiceForEntry = vi.fn(async () =>
    options.intent === false && !options.unpaid ? null : 'invoice-1',
  );
  const claim = vi.fn(async () => (options.unpaid ? null : claimed));
  const refundIntents: RefundIntentRepository = {
    staleInvoiceIds: async () => [],
    closeIfReactivated,
    cancelledInvoiceForEntry,
    claim,
    finish,
  };
  const reserve = vi.fn(
    async (
      _ctx: RequestContext,
      request: RefundReservationRequest,
    ): Promise<RefundReservation> => ({
      status: 'reserved',
      invoiceId: request.invoiceId,
      providerPaymentId: request.providerPaymentId,
      idempotencyKey: request.idempotencyKey,
      amountCents: 4200,
      currency: 'EUR',
    }),
  );
  const paymentRefunds: PaymentRefundRepository = {
    getRefundable: async () => null,
    reserve,
    recordRefund: async () => 'recorded' as const,
  };
  const expire = vi.fn(async (): Promise<'expired' | 'completed'> =>
    options.sessionPaid ? 'completed' : 'expired',
  );
  const markSessionsExpired = vi.fn(async () => {});
  const checkoutRepository = {
    pendingSessions: async () => [{ id: 'cs_open' }],
    markSessionsExpired,
  } as unknown as CheckoutRepository;
  const paymentProvider = {
    refund,
    expireCheckoutSession: expire,
  } as unknown as PaymentProvider;
  const transition = vi.fn(
    async () =>
      ({
        id: 'entry-1',
        acceptanceStatus: 'withdrawn',
        adminDetails: {
          invoice: {
            id: 'invoice-1',
            paymentReference: 'RF',
            currency: 'EUR',
            totalCents: 4200,
            paidCents: options.unpaid ? 0 : 4200,
            status: options.unpaid ? 'cancelled' : 'paid',
            providerPayments: [],
            refundIntent: options.unpaid
              ? null
              : {
                  status: 'pending',
                  percent: null,
                  refundedCents: 0,
                  failure: null,
                },
          },
        },
      }) as never,
  );
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['entry:read', 'entry:write']),
      },
      entries: {
        getById: async () =>
          ({
            id: 'entry-1',
            verificationStatus: 'verified',
            acceptanceStatus: 'accepted',
          }) as never,
        transition,
        softDelete: async () => null,
      },
      entryWorkflows: {
        getOrganization: async () => null,
        getEffective: async () => revision,
        getPinnedForEntry: async () => revision,
        setOrganization: async () => revision,
        setEvent: async () => revision,
      },
      logger: { info() {}, warn, error() {} },
      ...(options.configured === false
        ? {}
        : {
            paymentProvider,
            paymentRefunds,
            refundIntents,
            checkoutRepository,
          }),
    }),
  );
  const withdraw = () =>
    app.request('/admin/entries/entry-1/transitions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        transition: 'acceptance',
        status: 'withdrawn',
        reason: 'Fahrer hat abgesagt',
      }),
    });
  return {
    withdraw,
    refund,
    reserve,
    finish,
    claim,
    warn,
    expire,
    markSessionsExpired,
    closeIfReactivated,
    cancelledInvoiceForEntry,
  };
}

describe('automatic refund after an admin cancellation', () => {
  it('refunds after the cancellation committed and reports the final outcome in the response', async () => {
    const { withdraw, refund, finish } = makeApp();
    const response = await withdraw();
    expect(response.status).toBe(200);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'auto-refund:intent-1:pi_1',
        amountCents: 4200,
        organizationId: org,
      }),
    );
    expect(finish).toHaveBeenCalledWith(
      expect.anything(),
      'intent-1',
      expect.objectContaining({ status: 'done', refundedCents: 4200 }),
    );
    const body = await response.json();
    expect(body.adminDetails.invoice.refundIntent).toEqual({
      status: 'done',
      percent: 100,
      refundedCents: 4200,
      failure: null,
    });
  });

  it('keeps the cancellation and shows the failure when the provider is down', async () => {
    const { withdraw, finish, warn } = makeApp({ providerFails: true });
    const response = await withdraw();
    expect(response.status).toBe(200);
    expect(
      (await response.json()).adminDetails.invoice.refundIntent,
    ).toMatchObject({ status: 'failed', failure: 'provider_unavailable' });
    expect(finish).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Automatic refund failed', {
      failure: 'provider_unavailable',
    });
  });

  it('leaves the response alone when the cancellation queued no refund or online payment is not configured', async () => {
    const none = makeApp({ intent: false });
    const response = await none.withdraw();
    expect(response.status).toBe(200);
    expect(none.refund).not.toHaveBeenCalled();
    expect(
      (await response.json()).adminDetails.invoice.refundIntent.status,
    ).toBe('pending');
    const unconfigured = makeApp({ configured: false });
    expect((await unconfigured.withdraw()).status).toBe(200);
    expect(unconfigured.refund).not.toHaveBeenCalled();
  });

  it('ends the open checkouts of the cancelled registration before refunding, so nothing is paid afterwards', async () => {
    const { withdraw, refund, expire, markSessionsExpired } = makeApp();
    expect((await withdraw()).status).toBe(200);
    expect(expire).toHaveBeenCalledWith({
      organizationId: org,
      sessionId: 'cs_open',
    });
    expect(markSessionsExpired).toHaveBeenCalledWith(
      expect.anything(),
      'invoice-1',
      ['cs_open'],
    );
    expect(expire.mock.invocationCallOrder[0]!).toBeLessThan(
      refund.mock.invocationCallOrder[0]!,
    );
  });

  it('expires an unpaid cancelled invoice checkout even when no refund intent exists', async () => {
    const s = makeApp({ intent: false, unpaid: true });
    const response = await s.withdraw();
    expect(response.status).toBe(200);
    expect(s.closeIfReactivated).toHaveBeenCalledWith(
      expect.anything(),
      'entry-1',
    );
    expect(s.cancelledInvoiceForEntry).toHaveBeenCalledWith(
      expect.anything(),
      'entry-1',
    );
    expect(s.expire).toHaveBeenCalledWith({
      organizationId: org,
      sessionId: 'cs_open',
    });
    expect(s.markSessionsExpired).toHaveBeenCalledWith(
      expect.anything(),
      'invoice-1',
      ['cs_open'],
    );
    expect(s.claim).toHaveBeenCalledWith(expect.anything(), 'invoice-1');
    expect(s.expire.mock.invocationCallOrder[0]!).toBeLessThan(
      s.claim.mock.invocationCallOrder[0]!,
    );
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.refund).not.toHaveBeenCalled();
    expect(s.finish).not.toHaveBeenCalled();
    expect((await response.json()).adminDetails.invoice).toMatchObject({
      paidCents: 0,
      status: 'cancelled',
      refundIntent: null,
    });
  });

  it('keeps going and logs when a checkout was paid meanwhile, leaving that session untouched', async () => {
    const { withdraw, refund, warn, markSessionsExpired } = makeApp({
      sessionPaid: true,
    });
    expect((await withdraw()).status).toBe(200);
    expect(markSessionsExpired).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Open checkout of a cancelled registration',
      { outcome: 'completed' },
    );
    expect(refund).toHaveBeenCalled();
  });
});
