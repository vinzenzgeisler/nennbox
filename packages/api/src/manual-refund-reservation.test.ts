import { describe, expect, it, vi } from 'vitest';
import { RefundRejectedError } from '@nennbox/core';
import type {
  PaymentProvider,
  PaymentRefundRepository,
  RefundReservation,
} from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps } from './testing.js';

const org = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
function setup(reservation: RefundReservation) {
  const reserve = vi.fn(async () => reservation);
  const refund = vi.fn(async () => ({ id: 're_1' }));
  const rejectReservation = vi.fn(async () => {});
  const recordRefund = vi.fn(async () => 'recorded' as const);
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
        resolvePermissions: async () => new Set(['payment:write']),
      },
      paymentRefunds: {
        rejectReservation,
        reserve,
        recordRefund,
        getRefundable: async () => ({
          invoiceId: 'invoice-1',
          providerPaymentId: 'pi_1',
          refundableCents: 4200,
          currency: 'EUR',
        }),
      } as PaymentRefundRepository,
      paymentProvider: { refund } as unknown as PaymentProvider,
    }),
  );
  const request = () =>
    app.request('/admin/invoices/invoice-1/refunds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerPaymentId: 'pi_1',
        amountCents: 2100,
        idempotencyKey: key,
        reason: 'Office refund',
      }),
    });
  return { request, reserve, refund, recordRefund, rejectReservation };
}

describe('manual refund reservation boundary', () => {
  it('never transfers when another refund reserved the policy target', async () => {
    const s = setup({ status: 'unavailable' });
    expect((await s.request()).status).toBe(409);
    expect(s.reserve).toHaveBeenCalledOnce();
    expect(s.refund).not.toHaveBeenCalled();
    expect(s.recordRefund).not.toHaveBeenCalled();
  });
  it('uses the persisted operation and carries its key into atomic ledger completion', async () => {
    const s = setup({
      status: 'reserved',
      invoiceId: 'invoice-1',
      providerPaymentId: 'pi_1',
      amountCents: 2100,
      currency: 'EUR',
      idempotencyKey: key,
    });
    expect((await s.request()).status).toBe(201);
    expect(s.reserve.mock.invocationCallOrder[0]!).toBeLessThan(
      s.refund.mock.invocationCallOrder[0]!,
    );
    expect(s.reserve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: {
          kind: 'manual',
          amountCents: 2100,
          actor: 'https://id.example#office',
          reason: 'Office refund',
        },
      }),
    );
    expect(s.recordRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reservationKey: key,
        amountCents: 2100,
        providerRefundId: 're_1',
      }),
    );
  });
  it('returns a completed operation without a second provider call', async () => {
    const s = setup({
      status: 'completed',
      amountCents: 2100,
      providerRefundId: 're_existing',
    });
    const response = await s.request();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      refundId: 're_existing',
      duplicate: true,
    });
    expect(s.refund).not.toHaveBeenCalled();
    expect(s.recordRefund).not.toHaveBeenCalled();
  });
  it('releases an authoritative provider rejection without booking imaginary money', async () => {
    const s = setup({
      status: 'reserved',
      invoiceId: 'invoice-1',
      providerPaymentId: 'pi_1',
      amountCents: 2100,
      currency: 'EUR',
      idempotencyKey: key,
    });
    s.refund.mockRejectedValueOnce(new RefundRejectedError());
    expect((await s.request()).status).toBe(503);
    expect(s.rejectReservation).toHaveBeenCalledWith(expect.anything(), key);
    expect(s.recordRefund).not.toHaveBeenCalled();
  });
});
