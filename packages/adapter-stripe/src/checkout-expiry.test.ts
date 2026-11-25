import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { organizationId } from '@nennbox/core';
import { createStripePaymentProvider } from './index.js';

it('sends the configured checkout deadline to Stripe, including its minimum thirty-minute window', async () => {
  const bodies: URLSearchParams[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += String(chunk);
    bodies.push(new URLSearchParams(body));
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        id: 'cs_expiry',
        url: 'https://checkout.test/expiry',
        expires_at: Number(bodies.at(-1)!.get('expires_at')),
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    const provider = createStripePaymentProvider({
      secretKey: 'sk_test_fixture',
      webhookSecret: 'whsec_fixture',
      apiBaseUrl: `http://127.0.0.1:${address.port}`,
    });
    const deadline = new Date(Date.now() + 90 * 60_000).toISOString();
    const session = await provider.createCheckoutSession({
      organizationId: organizationId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      invoiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      idempotencyKey: 'expiry-fixture',
      amountCents: 4200,
      currency: 'EUR',
      description: 'Test',
      successUrl: 'https://test.example/success',
      cancelUrl: 'https://test.example/cancel',
      paymentMethods: ['card'],
      expiresAt: deadline,
    });
    expect(Number(bodies[0]!.get('expires_at'))).toBe(
      Math.floor(Date.parse(deadline) / 1000),
    );
    expect(Date.parse(session.expiresAt!)).toBeGreaterThan(
      Date.now() + 89 * 60_000,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
