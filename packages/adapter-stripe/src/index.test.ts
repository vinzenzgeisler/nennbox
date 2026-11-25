import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createStripePaymentProvider } from './index.js';

const secret = 'whsec_test_fixture';
const provider = createStripePaymentProvider({
  secretKey: ['sk', 'test', 'fixture'].join('_'),
  webhookSecret: secret,
});
const paymentIntentFixture = {
  id: 'evt_test_paid_01',
  object: 'event',
  api_version: '2025-03-31.basil',
  created: 1_794_422_200,
  data: {
    object: {
      id: 'cs_test_01',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: 'pi_test_01',
      amount_total: 4200,
      currency: 'eur',
      metadata: {
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        invoiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type: 'checkout.session.completed',
};

function signed(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret,
  });
  return { rawBody, signature };
}

describe('Stripe payment provider', () => {
  it('verifies signed checkout webhooks and returns provider-neutral payment events', async () => {
    const { rawBody, signature } = signed(paymentIntentFixture);
    await expect(provider.verifyWebhook(rawBody, signature)).resolves.toEqual({
      id: 'evt_test_paid_01',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invoiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sessionId: 'cs_test_01',
      type: 'succeeded',
      amountCents: 4200,
      currency: 'eur',
      paymentId: 'pi_test_01',
    });
  });

  it('rejects invalid signatures before trusting event metadata', async () => {
    const { rawBody } = signed(paymentIntentFixture);
    await expect(
      provider.verifyWebhook(rawBody, 't=1,v1=invalid'),
    ).rejects.toThrow();
  });

  it('rejects a signed event whose invoice/organization metadata is incomplete', async () => {
    const { rawBody, signature } = signed({
      ...paymentIntentFixture,
      data: { object: { ...paymentIntentFixture.data.object, metadata: null } },
    });
    await expect(provider.verifyWebhook(rawBody, signature)).rejects.toThrow(
      /metadata/,
    );
  });

  it('ignores a checkout that completed but is not paid yet (SEPA debit confirms later)', async () => {
    const { rawBody, signature } = signed({
      ...paymentIntentFixture,
      id: 'evt_test_pending_sepa',
      data: {
        object: {
          ...paymentIntentFixture.data.object,
          payment_status: 'unpaid',
          payment_intent: 'pi_sepa_01',
        },
      },
    });
    await expect(
      provider.verifyWebhook(rawBody, signature),
    ).resolves.toBeNull();
  });

  it('applies the later asynchronous confirmation of a SEPA payment', async () => {
    const { rawBody, signature } = signed({
      ...paymentIntentFixture,
      id: 'evt_test_sepa_paid',
      type: 'checkout.session.async_payment_succeeded',
    });
    await expect(
      provider.verifyWebhook(rawBody, signature),
    ).resolves.toMatchObject({
      id: 'evt_test_sepa_paid',
      type: 'succeeded',
      sessionId: 'cs_test_01',
      paymentId: 'pi_test_01',
    });
  });

  it.each([
    ['checkout.session.expired', 'expired'],
    ['checkout.session.async_payment_failed', 'failed'],
  ])(
    'maps %s to a %s event of the same checkout session',
    async (type, outcome) => {
      const { rawBody, signature } = signed({
        ...paymentIntentFixture,
        id: `evt_${outcome}`,
        type,
        data: {
          object: {
            ...paymentIntentFixture.data.object,
            payment_status: 'unpaid',
            payment_intent: null,
          },
        },
      });
      await expect(
        provider.verifyWebhook(rawBody, signature),
      ).resolves.toMatchObject({
        id: `evt_${outcome}`,
        type: outcome,
        sessionId: 'cs_test_01',
        invoiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      });
    },
  );

  it('acknowledges authentic events of other types without applying them', async () => {
    const { rawBody, signature } = signed({
      ...paymentIntentFixture,
      id: 'evt_test_other',
      type: 'customer.created',
    });
    await expect(
      provider.verifyWebhook(rawBody, signature),
    ).resolves.toBeNull();
  });

  it('refuses events of connected accounts on the single-account adapter', async () => {
    const { rawBody, signature } = signed({
      ...paymentIntentFixture,
      account: 'acct_other_club',
    });
    await expect(provider.verifyWebhook(rawBody, signature)).rejects.toThrow(
      /Connected-account/,
    );
  });

  it('rejects a payload signed with another secret', async () => {
    const rawBody = JSON.stringify(paymentIntentFixture);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: 'whsec_someone_else',
    });
    await expect(provider.verifyWebhook(rawBody, signature)).rejects.toThrow();
  });

  it('rejects a tampered body even with a valid signature header of the original', async () => {
    const { rawBody, signature } = signed(paymentIntentFixture);
    await expect(
      provider.verifyWebhook(rawBody.replace('4200', '1'), signature),
    ).rejects.toThrow();
  });
});
