import { describe, expect, it, vi } from 'vitest';
import { organizationId, type PaymentProvider } from '@nennbox/core';
import type { DriverPortalRepository } from '@nennbox/adapter-postgres';
import { createApp } from './app.js';
import { testDeps, testRegistration } from './testing.js';

const organization = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const invoiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = 'a'.repeat(43);
const cookie = `driver_portal_session=${token}`;

function makeApp(options: {
  online: boolean;
  paidCents?: number;
  methods?: ('card' | 'sepa_debit')[];
  pending?: boolean;
  pendingAmountCents?: number;
  pendingMethods?: ('card' | 'sepa_debit')[] | null;
  cancelled?: boolean;
}) {
  const createCheckoutSession = vi.fn(async () => ({
    id: 'cs_1',
    url: 'https://checkout.stripe.test/cs_1',
  }));
  const expireCheckoutSession = vi.fn(
    async (): Promise<'expired' | 'completed'> => 'expired',
  );
  const markSessionsExpired = vi.fn(async () => {});
  const createSession = vi.fn(async () => {});
  const paymentProvider: PaymentProvider = {
    createCheckoutSession,
    expireCheckoutSession,
    verifyWebhook: async () => {
      throw new Error('unused');
    },
    refund: async () => ({ id: 're_1' }),
  };
  const paidCents = options.paidCents ?? 0;
  const pendingSession = () =>
    options.pending
      ? {
          id: 'cs_pending',
          url: 'https://checkout.stripe.test/cs_pending',
          amountCents: options.pendingAmountCents ?? 4200 - paidCents,
          // Sessions from before the methods were stored have none.
          paymentMethods:
            options.pendingMethods === undefined
              ? (options.methods ?? ['card', 'sepa_debit'])
              : options.pendingMethods,
          expiresAt: null,
        }
      : null;
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
                paymentMethods: options.methods ?? ['card', 'sepa_debit'],
                totalCents: 4200,
                paidCents,
                currency: 'EUR',
                status: paidCents >= 4200 ? 'paid' : 'open',
                sessionCount: options.pending ? 1 : 0,
                allEntriesCancelled: options.cancelled ?? false,
                pendingSession: pendingSession(),
                openSessions: pendingSession() ? [pendingSession()!] : [],
              }
            : null,
        createSession,
        pendingSessions: async () =>
          options.pending ? [{ id: 'cs_pending' }] : [],
        markSessionsExpired,
        applyProviderEvent: async () => 'applied',
      },
    }),
  );
  return {
    app,
    createCheckoutSession,
    expireCheckoutSession,
    markSessionsExpired,
    createSession,
  };
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

  it('follows the event setting: no enabled online method means no pay button and no checkout', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      methods: [],
    });
    const view = await (
      await app.request('/public/driver-portal', { headers: { cookie } })
    ).json();
    expect(view.payment.onlinePayable).toBe(false);
    expect((await post(app)).status).toBe(503);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('offers the event methods, not a fixed list', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      methods: ['sepa_debit'],
    });
    expect((await post(app)).status).toBe(201);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethods: ['sepa_debit'] }),
    );
  });

  it('resumes an unpaid checkout instead of opening a second one ("später bezahlen")', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      pending: true,
    });
    const view = await (
      await app.request('/public/driver-portal', { headers: { cookie } })
    ).json();
    expect(view.payment.checkoutPending).toBe(true);
    const response = await post(app);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/cs_pending',
    });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('replaces a checkout created for an outdated amount with a fresh provider idempotency key', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      pending: true,
      pendingAmountCents: 9900,
    });
    const response = await post(app);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/cs_1',
    });
    // The first checkout of the invoice used sequence 0; the replacement must not
    // collide with it or the provider would hand back the old, outdated session.
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `checkout:${invoiceId}:4200:1`,
      }),
    );
  });

  it('ends the outdated checkout at the provider before opening its replacement, so it cannot be paid twice', async () => {
    const {
      app,
      createCheckoutSession,
      expireCheckoutSession,
      markSessionsExpired,
    } = makeApp({ online: true, pending: true, pendingAmountCents: 9900 });
    expect((await post(app)).status).toBe(201);
    expect(expireCheckoutSession).toHaveBeenCalledWith({
      organizationId: organization,
      sessionId: 'cs_pending',
    });
    expect(markSessionsExpired).toHaveBeenCalledWith(
      expect.anything(),
      invoiceId,
      ['cs_pending'],
    );
    expect(expireCheckoutSession.mock.invocationCallOrder[0]!).toBeLessThan(
      createCheckoutSession.mock.invocationCallOrder[0]!,
    );
  });

  it('sets an explicit default expiry on new checkout creation', async () => {
    const { app, createCheckoutSession } = makeApp({ online: true });
    const before = Date.now();
    expect((await post(app)).status).toBe(201);
    const request = createCheckoutSession.mock.calls[0]![0];
    expect(Date.parse(request.expiresAt!)).toBeGreaterThanOrEqual(
      before + 60 * 60_000,
    );
    expect(Date.parse(request.expiresAt!)).toBeLessThanOrEqual(
      Date.now() + 60 * 60_000,
    );
  });

  it('replaces a checkout from before the amount and methods were stored (NULL) instead of reusing it', async () => {
    const { app, createCheckoutSession, expireCheckoutSession } = makeApp({
      online: true,
      pending: true,
      pendingMethods: null,
    });
    expect((await post(app)).status).toBe(201);
    expect(expireCheckoutSession).toHaveBeenCalledOnce();
    expect(createCheckoutSession).toHaveBeenCalledOnce();
  });

  it('replaces a checkout whose methods differ from the current event setting, also after the organizer switched one off', async () => {
    const { app, createCheckoutSession, expireCheckoutSession } = makeApp({
      online: true,
      pending: true,
      methods: ['card'],
      pendingMethods: ['card', 'sepa_debit'],
    });
    expect((await post(app)).status).toBe(201);
    expect(expireCheckoutSession).toHaveBeenCalledOnce();
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethods: ['card'] }),
    );
  });

  it('resumes a checkout with the same methods in another order', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      pending: true,
      methods: ['card', 'sepa_debit'],
      pendingMethods: ['sepa_debit', 'card'],
    });
    expect((await post(app)).status).toBe(201);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('opens no second checkout when the older one was already paid, and says so', async () => {
    const {
      app,
      createCheckoutSession,
      markSessionsExpired,
      expireCheckoutSession,
    } = makeApp({ online: true, pending: true, pendingAmountCents: 9900 });
    expireCheckoutSession.mockResolvedValueOnce('completed');
    const response = await post(app);
    expect(response.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(markSessionsExpired).not.toHaveBeenCalled();
  });

  it('opens no second checkout when the older one could not be ended', async () => {
    const {
      app,
      createCheckoutSession,
      expireCheckoutSession,
      markSessionsExpired,
    } = makeApp({ online: true, pending: true, pendingAmountCents: 9900 });
    expireCheckoutSession.mockRejectedValueOnce(new Error('provider down'));
    expect((await post(app)).status).toBe(503);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(markSessionsExpired).not.toHaveBeenCalled();
  });

  it('answers a double click with the same checkout twice instead of failing the second request', async () => {
    const { app, createSession } = makeApp({ online: true });
    const [first, second] = await Promise.all([post(app), post(app)]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await first.json()).toEqual(await second.json());
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it('offers no checkout for a registration whose entries are all withdrawn', async () => {
    const { app, createCheckoutSession } = makeApp({
      online: true,
      cancelled: true,
    });
    expect((await post(app)).status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('cancels the unpaid checkout at the provider and locally ("Zahlung abbrechen")', async () => {
    const { app, expireCheckoutSession, markSessionsExpired } = makeApp({
      online: true,
      pending: true,
    });
    const response = await app.request('/public/driver-portal/payment/cancel', {
      method: 'POST',
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(expireCheckoutSession).toHaveBeenCalledWith({
      organizationId: organization,
      sessionId: 'cs_pending',
    });
    expect(markSessionsExpired).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: organization }),
      invoiceId,
      ['cs_pending'],
    );
  });

  it('reports a failed cancel instead of pretending it worked, and keeps the checkout pending locally', async () => {
    const { app, expireCheckoutSession, markSessionsExpired } = makeApp({
      online: true,
      pending: true,
    });
    expireCheckoutSession.mockRejectedValueOnce(new Error('provider down'));
    const response = await app.request('/public/driver-portal/payment/cancel', {
      method: 'POST',
      headers: { cookie },
    });
    expect(response.status).toBe(503);
    expect(markSessionsExpired).not.toHaveBeenCalled();
  });

  it('answers cancel with 404 when nothing is pending, without a session, or cross-origin', async () => {
    const idle = makeApp({ online: true });
    const url = '/public/driver-portal/payment/cancel';
    expect(
      (await idle.app.request(url, { method: 'POST', headers: { cookie } }))
        .status,
    ).toBe(404);
    const { app, expireCheckoutSession } = makeApp({
      online: true,
      pending: true,
    });
    expect((await app.request(url, { method: 'POST' })).status).toBe(404);
    expect(
      (
        await app.request(url, {
          method: 'POST',
          headers: { cookie, origin: 'https://attacker.example' },
        })
      ).status,
    ).toBe(404);
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });

  it('does not report a cancel as done when the checkout was paid in the meantime', async () => {
    const { app, expireCheckoutSession, markSessionsExpired } = makeApp({
      online: true,
      pending: true,
    });
    expireCheckoutSession.mockResolvedValueOnce('completed');
    const response = await app.request('/public/driver-portal/payment/cancel', {
      method: 'POST',
      headers: { cookie },
    });
    expect(response.status).toBe(409);
    expect(markSessionsExpired).not.toHaveBeenCalled();
  });
});
