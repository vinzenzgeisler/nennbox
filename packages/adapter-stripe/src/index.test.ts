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
});
