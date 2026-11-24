import { describe, expect, it, vi } from 'vitest';
import {
  defaultEntryWorkflow,
  organizationId,
  type ClaimedRefundIntent,
  type PaymentProvider,
  type PaymentRefundRepository,
  type RefundIntentRepository,
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
      currency: 'EUR',
    },
  ],
};

function makeApp(
  options: {
    intent?: boolean;
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
  const refundIntents: RefundIntentRepository = {
    openInvoiceForEntry: async () =>
      options.intent === false ? null : 'invoice-1',
    claim: async () => claimed,
    finish,
  };
  const paymentRefunds = {
    getRefundable: async () => null,
    recordRefund: async () => 'recorded' as const,
  } as PaymentRefundRepository;
  const paymentProvider = {
    refund,
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
            paidCents: 4200,
            status: 'paid',
            providerPayments: [],
            refundIntent: {
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
        : { paymentProvider, paymentRefunds, refundIntents }),
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
  return { withdraw, refund, finish, warn };
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
});
