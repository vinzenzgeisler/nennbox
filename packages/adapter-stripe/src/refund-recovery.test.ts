import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { RefundRejectedError, organizationId } from '@nennbox/core';
import { createStripePaymentProvider } from './index.js';

it('finds the persisted refund operation across pages after the provider idempotency cache has expired', async () => {
  let stored: Record<string, unknown> | undefined;
  let creations = 0;
  let pages = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += String(chunk);
      const input = new URLSearchParams(body);
      creations++;
      stored = {
        id: 're_original',
        object: 'refund',
        amount: Number(input.get('amount')),
        status: 'succeeded',
        metadata: {
          organizationId: input.get('metadata[organizationId]'),
          invoiceId: input.get('metadata[invoiceId]'),
          operation: input.get('metadata[operation]'),
        },
      };
      // No provider-side idempotency cache: each POST would really move money.
      response.end(JSON.stringify(stored));
    } else {
      pages++;
      const after = new URL(request.url!, 'http://localhost').searchParams.get(
        'starting_after',
      );
      const data = !stored
        ? []
        : after
          ? [stored]
          : [{ id: 're_unrelated', object: 'refund', metadata: {}, amount: 1 }];
      response.end(
        JSON.stringify({
          object: 'list',
          url: '/v1/refunds',
          data,
          has_more: Boolean(stored && !after),
        }),
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address() as { port: number };
    const provider = createStripePaymentProvider({
      secretKey: 'sk_test_fixture',
      webhookSecret: 'whsec_fixture',
      apiBaseUrl: 'http://127.0.0.1:' + port,
    });
    const request = {
      idempotencyKey: 'persisted-operation',
      organizationId: organizationId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      invoiceId: 'invoice-1',
      paymentId: 'pi_1',
      amountCents: 2100,
      reason: 'Refund',
    };
    expect(await provider.refund(request)).toEqual({ id: 're_original' });
    expect(await provider.refund(request)).toEqual({ id: 're_original' });
    expect(creations).toBe(1);
    expect(pages).toBe(3);
    stored!.status = 'failed';
    await expect(provider.refund(request)).rejects.toBeInstanceOf(
      RefundRejectedError,
    );
    expect(creations).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

describe('permanent Stripe refund errors', () => {
  async function refundAgainst(status: number, error: Record<string, unknown>) {
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'POST') {
        response.statusCode = status;
        response.end(JSON.stringify({ error }));
      } else
        response.end(
          JSON.stringify({
            object: 'list',
            url: '/v1/refunds',
            data: [],
            has_more: false,
          }),
        );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const { port } = server.address() as { port: number };
      return await createStripePaymentProvider({
        secretKey: 'sk_test_fixture',
        webhookSecret: 'whsec_fixture',
        apiBaseUrl: 'http://127.0.0.1:' + port,
      })
        .refund({
          idempotencyKey: 'op',
          organizationId: organizationId(
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ),
          invoiceId: 'invoice-1',
          paymentId: 'pi_1',
          amountCents: 2100,
          reason: 'Refund',
        })
        .then(
          () => null,
          (caught: unknown) => caught,
        );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((closeError) =>
          closeError ? reject(closeError) : resolve(),
        ),
      );
    }
  }

  it.each([
    'charge_already_refunded',
    'charge_disputed',
    'amount_too_large',
    'resource_missing',
  ])('treats %s as a definitive rejection', async (code) => {
    const caught = await refundAgainst(400, {
      type: 'invalid_request_error',
      code,
      message: 'detail that must not travel',
    });
    expect(caught).toBeInstanceOf(RefundRejectedError);
    expect((caught as RefundRejectedError).code).toBe(code);
  });

  it.each([
    [400, { type: 'invalid_request_error', code: 'lock_timeout' }],
    [400, { type: 'invalid_request_error', code: 'idempotency_key_in_use' }],
    [429, { type: 'invalid_request_error', code: 'rate_limit' }],
    [500, { type: 'api_error' }],
  ])(
    'keeps %s %j ambiguous, so the reservation is never released by mistake',
    async (status, error) => {
      const caught = await refundAgainst(status, error);
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(RefundRejectedError);
    },
  );
});
