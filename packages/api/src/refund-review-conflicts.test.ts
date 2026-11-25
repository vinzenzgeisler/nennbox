import { describe, expect, it, vi } from 'vitest';
import { defaultEntryWorkflow, organizationId } from '@nennbox/core';
import type { PaymentProvider, PaymentRefundRepository } from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps } from './testing.js';

const org = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const key = '33333333-3333-4333-8333-333333333333';
const revision = {
  id: 'revision-1',
  organizationId: organizationId(org),
  eventId: 'event-1',
  version: 1,
  workflow: defaultEntryWorkflow,
};

function setup(
  options: {
    transitionFails?: string;
    abandon?: 'abandoned' | 'not_found' | 'not_reviewable';
    refundFails?: Error;
    attempt?: 'retry' | 'needs_review';
    permissions?: string[];
  } = {},
) {
  const abandonReservation = vi.fn(async () => options.abandon ?? 'abandoned');
  const recordFailedAttempt = vi.fn(async () => options.attempt ?? 'retry');
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'office',
        }),
      },
      memberships: {
        resolvePermissions: async () =>
          new Set(
            options.permissions ?? [
              'entry:read',
              'entry:write',
              'payment:write',
            ],
          ),
      },
      entries: {
        getById: async () =>
          ({
            id: entryId,
            verificationStatus: 'verified',
            acceptanceStatus: 'rejected',
          }) as never,
        transition: async () => {
          throw new Error(options.transitionFails ?? 'not allowed');
        },
        softDelete: async () => null,
      },
      entryWorkflows: {
        getOrganization: async () => null,
        getEffective: async () => revision,
        getPinnedForEntry: async () => revision,
        setOrganization: async () => revision,
        setEvent: async () => revision,
      },
      paymentRefunds: {
        withExecution: async (_ctx, _key, run) => run(),
        abandonReservation,
        recordFailedAttempt,
        getRefundable: async () => null,
        reserve: async (_ctx, request) => ({
          status: 'reserved',
          invoiceId: request.invoiceId,
          providerPaymentId: request.providerPaymentId,
          idempotencyKey: request.idempotencyKey,
          amountCents: 2100,
          currency: 'EUR',
        }),
        recordRefund: async () => 'recorded' as const,
      } as PaymentRefundRepository,
      paymentProvider: {
        refund: async () => {
          if (options.refundFails) throw options.refundFails;
          return { id: 're_1' };
        },
      } as unknown as PaymentProvider,
    }),
  );
  const json = { 'content-type': 'application/json' };
  return {
    abandonReservation,
    recordFailedAttempt,
    reactivate: () =>
      app.request(`/admin/entries/${entryId}/transitions`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          transition: 'acceptance',
          status: 'pending',
          reason: 'Wieder dabei',
        }),
      }),
    abandon: (body: unknown = { reason: 'In Stripe geprüft' }) =>
      app.request(
        `/admin/invoices/invoice-1/refund-reservations/${key}/abandon`,
        {
          method: 'POST',
          headers: json,
          body: JSON.stringify(body),
        },
      ),
    refund: () =>
      app.request('/admin/invoices/invoice-1/refunds', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          providerPaymentId: 'pi_1',
          amountCents: 2100,
          idempotencyKey: key,
          reason: 'Kulanz',
        }),
      }),
  };
}

describe('conflicts the office can understand', () => {
  it.each([
    ['refund_in_progress', 'Refund in progress; reconcile before reactivation'],
    [
      'refund_needs_review',
      'Refund needs review; resolve it before reactivation',
    ],
    ['concurrent_update', 'Concurrent update; try again'],
  ])(
    'answers a %s transition with 409 and the reason, not with a permission error',
    async (reason, error) => {
      const response = await setup({ transitionFails: reason }).reactivate();
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error, reason });
    },
  );

  it('keeps every other transition failure the generic 403', async () => {
    const response = await setup({
      transitionFails: 'anything else',
    }).reactivate();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Forbidden or invalid transition',
    });
  });
});

describe('abandoning a refund that needs review', () => {
  it('abandons it with the office actor and reason', async () => {
    const s = setup();
    const response = await s.abandon();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ abandoned: true });
    expect(s.abandonReservation).toHaveBeenCalledWith(expect.anything(), {
      invoiceId: 'invoice-1',
      key,
      actor: 'https://id.example#office',
      reason: 'In Stripe geprüft',
    });
  });
  it('requires a reason and the payment permission', async () => {
    const s = setup();
    expect((await s.abandon({ reason: '  ' })).status).toBe(400);
    expect((await s.abandon({})).status).toBe(400);
    const denied = setup({ permissions: ['entry:read'] });
    expect((await denied.abandon()).status).toBe(403);
    expect(denied.abandonReservation).not.toHaveBeenCalled();
  });
  it('says unknown refunds are unknown and unflagged ones are not waiting for review', async () => {
    expect((await setup({ abandon: 'not_found' }).abandon()).status).toBe(404);
    const response = await setup({ abandon: 'not_reviewable' }).abandon();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Refund is not waiting for review',
      reason: 'not_reviewable',
    });
  });
});

describe('manual refund attempts that fail at the provider', () => {
  it('counts an ambiguous failure and stays retryable below the limit', async () => {
    const s = setup({ refundFails: new Error('stripe down') });
    const response = await s.refund();
    expect(response.status).toBe(503);
    expect(s.recordFailedAttempt).toHaveBeenCalledWith(
      expect.anything(),
      key,
      'Error',
    );
  });
  it('tells the office when the attempt limit was reached', async () => {
    const response = await setup({
      refundFails: new Error('stripe down'),
      attempt: 'needs_review',
    }).refund();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Refund needs review',
      reason: 'needs_review',
    });
  });
});
