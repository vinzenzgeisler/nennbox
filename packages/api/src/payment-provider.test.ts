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
  type: 'succeeded',
  amountCents: 4200,
  currency: 'eur',
  paymentId: 'pi_1',
};

function makeApp(event: PaymentProviderEvent = paidEvent) {
  const createCheckoutSession = vi.fn(async () => ({
    id: 'cs_1',
    url: 'https://checkout.stripe.test/cs_1',
  }));
  const applyProviderEvent = vi.fn(async () => 'applied' as const);
  const verifyWebhook = vi.fn(async (body: string, signature: string) => {
    if (!body || !signature) throw new Error('Missing webhook input');
    return event;
  });
  const paymentProvider: PaymentProvider = {
    createCheckoutSession,
    verifyWebhook,
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
              }
            : null,
        createSession: async () => {},
        applyProviderEvent,
      },
    }),
  );
  return { app, createCheckoutSession, applyProviderEvent, verifyWebhook };
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
});
