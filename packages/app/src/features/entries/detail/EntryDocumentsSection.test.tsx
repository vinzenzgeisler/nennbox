// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { EntryDocumentsSection } from './EntryDocumentsSection.js';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const entryWith = (invoice: Record<string, unknown>) =>
  ({
    id: 'entry-1',
    statusProjection: { dimensions: [] },
    adminDetails: {
      customAnswers: [],
      invoice: {
        id: '6f1b1c4e-1111-4222-8333-444455556666',
        paymentReference: 'RF18 1234',
        currency: 'EUR',
        totalCents: 4200,
        paidCents: 4200,
        status: 'paid',
        providerPayments: [],
        ...invoice,
      },
    },
  }) as unknown as Entry;

const render = (entry: Entry) =>
  act(async () =>
    root.render(
      <EntryDocumentsSection
        entry={entry}
        busy={false}
        onDimensionAction={() => {}}
        onRecordPayment={() => {}}
        onRefundPayment={() => {}}
        onReviewDocument={() => {}}
        onRejectDocument={() => {}}
      />,
    ),
  );
const text = () => host.textContent!.replace(/\s/g, ' ');

it('shows an overpayment with the amount and the way to refund it', async () => {
  await render(
    entryWith({
      paidCents: 8400,
      providerPayments: [{ providerPaymentId: 'pi_1', refundableCents: 8400 }],
    }),
  );
  expect(text()).toContain('Überzahlt um 42,00 €');
  expect(text()).toContain('Erstattung auslösen');
});

it('shows nothing about overpayment when the invoice was paid exactly', async () => {
  await render(entryWith({}));
  expect(text()).not.toContain('Überzahlt');
});

it('shows a failed automatic refund with the pointer to the manual refund', async () => {
  await render(
    entryWith({
      refundIntent: {
        status: 'failed',
        percent: 100,
        refundedCents: 0,
        failure: 'provider_unavailable',
      },
    }),
  );
  expect(text()).toContain('Die automatische Erstattung ist fehlgeschlagen');
});

it('shows a refund that needs review with the way out, and nothing the office cannot use', async () => {
  const stuck = [{ key: 'op-1', providerPaymentId: 'pi_1', amountCents: 2100 }];
  const onAbandonRefund = vi.fn();
  const onReconcileRefund = vi.fn();
  const renderWith = (handler?: typeof onAbandonRefund) =>
    act(async () =>
      root.render(
        <EntryDocumentsSection
          entry={entryWith({ stuckRefunds: stuck })}
          busy={false}
          onDimensionAction={() => {}}
          onRecordPayment={() => {}}
          onRefundPayment={() => {}}
          onAbandonRefund={handler}
          onReconcileRefund={handler ? onReconcileRefund : undefined}
          onReviewDocument={() => {}}
          onRejectDocument={() => {}}
        />,
      ),
    );
  await renderWith(onAbandonRefund);
  expect(text()).toContain('Eine Erstattung von 21,00 € hängt');
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === 'Erstattung abbrechen',
  );
  expect(button).toBeDefined();
  act(() => button!.click());
  expect(onAbandonRefund).toHaveBeenCalledWith('op-1', 2100, 'EUR');
  const reconcile = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === 'Klärung anfordern',
  );
  expect(reconcile).toBeDefined();
  act(() => reconcile!.click());
  expect(onReconcileRefund).toHaveBeenCalledWith('op-1', 2100, 'EUR');
  expect(text()).toContain('nicht allein weil im Dashboard');
  await renderWith(undefined);
  expect(
    [...host.querySelectorAll('button')].some(
      (item) => item.textContent === 'Erstattung abbrechen',
    ),
  ).toBe(false);
});

it('explains a payment after the cancellation as fully refundable', async () => {
  await render(
    entryWith({
      providerPayments: [
        { providerPaymentId: 'pi_late', refundableCents: 4200 },
      ],
      refundIntent: {
        status: 'failed',
        percent: null,
        refundedCents: 0,
        failure: 'payment_after_cancellation',
      },
    }),
  );
  expect(text()).toContain('in voller Höhe erstattbar');
  expect(text()).toContain('Erstattungsregel gilt dafür nicht');
});
