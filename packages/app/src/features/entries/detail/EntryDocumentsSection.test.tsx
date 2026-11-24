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
