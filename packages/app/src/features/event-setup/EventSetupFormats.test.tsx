// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { EventSetup } from './EventSetup.js';
vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
const saved = {
  id: 'active',
  name: 'Rallye',
  slug: 'rallye',
  startsOn: '2027-05-22',
  endsOn: '2027-05-23',
  status: 'draft',
};
const response = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data)));
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(adminFetch).mockImplementation((input) => {
    const url = String(input);
    if (url === '/admin/events') return response([saved]);
    if (url.endsWith('/payment-recipient'))
      return response({ recipient: null });
    if (url.endsWith('/active')) return response(saved);
    if (url.endsWith('/classes'))
      return response([
        {
          id: 'c',
          name: 'Tour',
          code: 'T',
          vehicleType: 'car',
          sortOrder: 0,
          maxParticipants: null,
          closed: false,
          passengerMode: 'none',
        },
      ]);
    if (url.endsWith('/pricing'))
      return response([
        {
          classId: 'c',
          baseCents: 12000,
          additionalEntryAdjustmentCents: 0,
          earlyBirdDeadline: null,
          earlyBirdDiscountCents: 0,
        },
      ]);
    if (url.endsWith('/consents')) return response({ terms: [] });
    throw new Error(`Unexpected request ${url}`);
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () =>
    root.render(<EventSetup eventId="active" onCreated={vi.fn()} />),
  );
}

it('shows the public-entry preview and class list with German date and money', async () => {
  await mount();
  const preview = container.querySelector('.nb-app-preview-card, aside');
  const text = container.textContent ?? '';
  expect(text).toContain('22.–23. Mai 2027');
  expect(text).toContain('Tour · 120,00 €');
  expect(text).toContain('T · 120,00 €');
  expect(text).not.toContain('2027-05-22 –');
  expect(text).not.toContain('120.00');
  expect(preview).not.toBeNull();
});

it('prefills the fee field with a decimal comma', async () => {
  await mount();
  const fee = container.querySelector<HTMLInputElement>('input[data-fee]')!;
  expect(fee.value).toBe('120,00');
});

it('offers "Neue Veranstaltung einrichten" as a header action, not under the select', async () => {
  await mount();
  const newEvent = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Neue Veranstaltung einrichten',
  )!;
  expect(newEvent.closest('.nb-event-setup-head')).not.toBeNull();
  expect(newEvent.closest('form')).toBeNull();
  const select = container.querySelector('select')!;
  expect(select.parentElement?.contains(newEvent)).toBe(false);
});
