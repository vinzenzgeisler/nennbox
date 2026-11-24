import { describe, expect, it, vi } from 'vitest';
import {
  organizationId,
  type PaymentProvider,
  type PaymentProviderEvent,
} from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps } from './testing.js';

const organization = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const invoiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const paidEvent: PaymentProviderEvent = {
  id: 'evt_1',
  organizationId: organizationId(organization),
  invoiceId,
  sessionId: 'cs_1',
  type: 'succeeded',
  amountCents: 4200,
  currency: 'eur',
  paymentId: 'pi_1',
};

function makeApp(
  event: PaymentProviderEvent | null = paidEvent,
  applied:
    'applied' | 'applied_with_mismatch' | 'duplicate' | 'not_found' = 'applied',
) {
  const createCheckoutSession = vi.fn(async () => ({
    id: 'cs_1',
    url: 'https://checkout.stripe.test/cs_1',
  }));
  const applyProviderEvent = vi.fn(async () => applied);
  const warn = vi.fn();
  const verifyWebhook = vi.fn(async (body: string, signature: string) => {
    if (!body || !signature) throw new Error('Missing webhook input');
    return event;
  });
  const paymentProvider: PaymentProvider = {
    createCheckoutSession,
    verifyWebhook,
    expireCheckoutSession: async () => {},
    refund: async () => ({ id: 're_1' }),
  };
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: organization },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      paymentProvider,
      paymentReturnOrigin: async () => 'https://nennbox.example.test',
      checkoutRepository: {
        get: async (ctx) =>
          ctx.organizationId === organizationId(organization)
            ? {
                id: invoiceId,
                paymentMethods: ['card'],
                organizationId: organizationId(organization),
                eventId: 'event-id',
                eventSlug: 'sommer-rallye',
                totalCents: 4200,
                paidCents: 0,
                currency: 'EUR',
                status: 'open',
                sessionCount: 0,
                pendingSession: null,
              }
            : null,
        createSession: async () => {},
        pendingSessions: async () => [],
        markSessionsExpired: async () => {},
        applyProviderEvent,
      },
      logger: { info() {}, warn, error() {} },
    }),
  );
  return {
    app,
    createCheckoutSession,
    applyProviderEvent,
    verifyWebhook,
    warn,
  };
}

describe('payment provider routes', () => {
  it('creates checkout from the invoice and does not trust request Host for return URLs', async () => {
    const { app, createCheckoutSession } = makeApp();
    const response = await app.request(
      `/public/organizations/${organization}/invoices/${invoiceId}/checkout`,
      {
        method: 'POST',
        headers: {
          host: 'attacker.example',
          'x-forwarded-host': 'attacker.example',
        },
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/cs_1',
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization,
        invoiceId,
        amountCents: 4200,
        successUrl: `https://nennbox.example.test/events/sommer-rallye/register?payment=success&invoice=${invoiceId}`,
        cancelUrl: `https://nennbox.example.test/events/sommer-rallye/register?payment=cancelled&invoice=${invoiceId}`,
      }),
    );
  });

  it('rejects a signed webhook attributed to another organization before ledger application', async () => {
    const { app, applyProviderEvent } = makeApp({
      ...paidEvent,
      organizationId: organizationId('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    });
    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{}',
    });
    expect(response.status).toBe(400);
    expect(applyProviderEvent).not.toHaveBeenCalled();
  });

  it('passes signed events into the idempotent domain repository', async () => {
    const { app, applyProviderEvent, verifyWebhook } = makeApp();
    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{"event":true}',
    });
    expect(response.status).toBe(200);
    expect(verifyWebhook).toHaveBeenCalledWith('{"event":true}', 'signed');
    expect(applyProviderEvent).toHaveBeenCalledWith(paidEvent);
  });

  it('rejects a webhook with a missing or invalid signature and applies nothing', async () => {
    const { app, applyProviderEvent, verifyWebhook, warn } = makeApp();
    const missing = await app.request('/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    expect(missing.status).toBe(400);
    expect(verifyWebhook).not.toHaveBeenCalled();
    verifyWebhook.mockRejectedValueOnce(new Error('bad signature'));
    const invalid = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=forged' },
      body: '{"forged":true}',
    });
    expect(invalid.status).toBe(400);
    expect(applyProviderEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Stripe webhook rejected', {
      errorName: 'Error',
    });
  });

  it('acknowledges an authentic event that carries nothing to apply, so the provider stops retrying', async () => {
    const { app, applyProviderEvent } = makeApp(null);
    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(applyProviderEvent).not.toHaveBeenCalled();
  });

  it('reports a replayed event id as duplicate without error', async () => {
    const { app } = makeApp(paidEvent, 'duplicate');
    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
  });

  it('logs and flags a payment whose amount differs from the open invoice instead of failing silently', async () => {
    const { app, warn } = makeApp(paidEvent, 'applied_with_mismatch');
    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ amountMismatch: true });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('differs from the open invoice amount'),
      { eventId: 'evt_1', invoiceId },
    );
  });

  it('logs an event for an unknown invoice and answers 404 so the provider keeps retrying', async () => {
    const { app, warn } = makeApp(paidEvent, 'not_found');
    const response = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{}',
    });
    expect(response.status).toBe(404);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('does not match any open invoice'),
      { eventId: 'evt_1', outcome: 'succeeded' },
    );
  });

  it('does not reuse a provider idempotency key after an earlier checkout of the invoice', async () => {
    const { app, createCheckoutSession } = makeApp();
    const response = await app.request(
      `/public/organizations/${organization}/invoices/${invoiceId}/checkout`,
      { method: 'POST' },
    );
    expect(response.status).toBe(201);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `checkout:${invoiceId}:4200:0`,
      }),
    );
  });

  it('rejects a payment method the event did not enable', async () => {
    const { app, createCheckoutSession } = makeApp();
    const response = await app.request(
      `/public/organizations/${organization}/invoices/${invoiceId}/checkout`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentMethods: ['klarna'] }),
      },
    );
    expect(response.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
