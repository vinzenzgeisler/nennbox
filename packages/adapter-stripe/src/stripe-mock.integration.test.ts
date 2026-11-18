import { describe, expect, it } from 'vitest';
import { organizationId } from '@racepilot/core';
import { createStripePaymentProvider } from './index.js';

const apiBaseUrl = process.env.STRIPE_MOCK_URL;
describe.skipIf(!apiBaseUrl)('Stripe mock checkout', () => {
  it('creates a hosted checkout session using the official Stripe SDK', async () => {
    const provider = createStripePaymentProvider({
      secretKey: ['sk', 'test', 'x'.repeat(24)].join('_'),
      webhookSecret: 'whsec_test_fixture',
      apiBaseUrl: apiBaseUrl!,
    });
    const session = await provider.createCheckoutSession({
      organizationId: organizationId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      invoiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      idempotencyKey: 'checkout:invoice-fixture:4200',
      amountCents: 4200,
      currency: 'EUR',
      description: 'Nennung Rallye',
      successUrl:
        'https://community.example.test/events/rallye/register?payment=success',
      cancelUrl:
        'https://community.example.test/events/rallye/register?payment=cancelled',
      paymentMethods: [],
    });
    expect(session.id).toMatch(/^cs_/);
    expect(session.url).toMatch(/^https:\/\//);
  });
});
