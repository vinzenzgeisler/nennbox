import { describe, expect, it, vi } from 'vitest';
import { organizationId, type PaymentProvider } from '@racepilot/core';
import type { DriverPortalRepository } from '@racepilot/adapter-postgres';
import { createApp } from './app.js';
import { testDeps, testRegistration } from './testing.js';

const organization = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const invoiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = 'a'.repeat(43);
const cookie = `driver_portal_session=${token}`;

function makeApp(options: { online: boolean; paidCents?: number }) {
  const createCheckoutSession = vi.fn(async () => ({
    id: 'cs_1',
    url: 'https://checkout.stripe.test/cs_1',
  }));
  const paymentProvider: PaymentProvider = {
    createCheckoutSession,
    verifyWebhook: async () => {
      throw new Error('unused');
    },
    refund: async () => ({ id: 're_1' }),
  };
  const paidCents = options.paidCents ?? 0;
  const driverPortal = {
    session: async (_ctx: unknown, value: string) =>
      value === token ? { groupId: 'group' } : null,
    view: async () => ({
      eventName: 'Sommer-Rallye',
      payment: {
        invoiceId,
        status: paidCents >= 4200 ? 'paid' : 'open',
        totalCents: 4200,
        paidCents,
        currency: 'EUR',
        paymentReference: 'NB-1',
      },
    }),
  } as unknown as DriverPortalRepository;
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: organization },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      driverPortal,
      publicRegistration: testRegistration({}),
      ...(options.online
        ? {
            paymentProvider,
            paymentReturnOrigin: async () => 'https://nennbox.example.test',
          }
        : {}),
      checkoutRepository: {
        get: async (ctx) =>
          ctx.organizationId === organizationId(organization)
            ? {
                id: invoiceId,
                organizationId: organizationId(organization),
                eventId: 'event-id',
                eventSlug: 'sommer-rallye',
                paymentMethods: ['card', 'sepa_debit'],
                totalCents: 4200,
                paidCents,
                currency: 'EUR',
                status: paidCents >= 4200 ? 'paid' : 'open',
              }
            : null,
        createSession: async () => {},
        applyProviderEvent: async () => 'applied',
      },
    }),
  );
  return { app, createCheckoutSession };
}

const post = (app: ReturnType<typeof makeApp>['app'], withCookie = true) =>
  app.request('/public/driver-portal/payment/checkout', {
    method: 'POST',
    headers: withCookie ? { cookie } : {},
  });

describe('driver portal online payment', () => {
  it('offers online payment only when a provider is configured and a balance is open', async () => {
    const online = makeApp({ online: true });
    const view = await (
      await online.app.request('/public/driver-portal', {
        headers: { cookie },
      })
    ).json();
    expect(view.payment.onlinePayable).toBe(true);
    const offline = makeApp({ online: false });
    const offlineView = await (
      await offline.app.request('/public/driver-portal', {
        headers: { cookie },
      })
    ).json();
    expect(offlineView.payment.onlinePayable).toBe(false);
    const settled = makeApp({ online: true, paidCents: 4200 });
    const settledView = await (
      await settled.app.request('/public/driver-portal', {
        headers: { cookie },
      })
    ).json();
    expect(settledView.payment.onlinePayable).toBe(false);
  });

  it('creates checkout for the session invoice and returns to the portal', async () => {
    const { app, createCheckoutSession } = makeApp({ online: true });
    const response = await post(app);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/cs_1',
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId,
        amountCents: 4200,
        successUrl:
          'https://nennbox.example.test/events/sommer-rallye/my-entry?payment=success',
        cancelUrl:
          'https://nennbox.example.test/events/sommer-rallye/my-entry?payment=cancelled',
      }),
    );
  });

  it('charges only the remaining balance and rejects cross-origin requests', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      paidCents: 1200,
    });
    const view = await (
      await app.request('/public/driver-portal', { headers: { cookie } })
    ).json();
    expect(view.payment.onlinePayable).toBe(true);
    expect(view.payment.paidCents).toBe(1200);
    const denied = await app.request('/public/driver-portal/payment/checkout', {
      method: 'POST',
      headers: { cookie, origin: 'https://attacker.example' },
    });
    expect(denied.status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect((await post(app)).status).toBe(201);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 3000, invoiceId }),
    );
  });

  it('rejects checkout without a portal session, when unavailable, or when settled', async () => {
    const { app, createCheckoutSession } = makeApp({ online: true });
    expect((await post(app, false)).status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect((await post(makeApp({ online: false }).app)).status).toBe(503);
    expect(
      (await post(makeApp({ online: true, paidCents: 4200 }).app)).status,
    ).toBe(404);
  });
});
