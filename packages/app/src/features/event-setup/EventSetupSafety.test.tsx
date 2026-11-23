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
  startsOn: '2027-05-01',
  endsOn: '2027-05-02',
  status: 'draft',
};
const recipient = {
  accountName: 'Club',
  iban: 'DE89370400440532013000',
  bic: null,
};
const response = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data)));
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
  vi.mocked(adminFetch).mockImplementation((input, init) => {
    const url = String(input);
    if (url === '/admin/events') return response([saved]);
    if (url.endsWith('/payment-recipient'))
      return response({
        recipient: init?.method === 'DELETE' ? null : recipient,
      });
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
    if (url.endsWith('/classes/c')) return response({ id: 'c' });
    if (url.endsWith('/pricing'))
      return response([
        {
          classId: 'c',
          baseCents: 1000,
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
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  )!;
const input = (name: string) =>
  [...container.querySelectorAll('input')].find(
    (item) =>
      item.closest('label')?.querySelector('span')?.textContent === name,
  )!;
async function fill(name: string, value: string) {
  await act(async () => {
    const field = input(name);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('loads the header event and starts a new event only on explicit action', async () => {
  await act(async () =>
    root.render(<EventSetup eventId="active" onCreated={vi.fn()} />),
  );
  expect(input('Name').value).toBe('Rallye');
  expect(container.querySelector('select')?.value).toBe('active');
  await act(async () => button('Neue Veranstaltung einrichten').click());
  expect(input('Name').value).toBe('');
});
it('keeps generating a new slug for every letter but preserves manual overrides', async () => {
  await act(async () => root.render(<EventSetup onCreated={vi.fn()} />));
  await fill('Name', 'R');
  await fill('Name', 'Rallye 2027');
  expect(input('Link-Kürzel').value).toBe('rallye-2027');
  await fill('Link-Kürzel', 'custom');
  await fill('Name', 'Rallye 2028');
  expect(input('Link-Kürzel').value).toBe('custom');
});
it('stages and undoes removal, then confirms organization-wide deletion only at save', async () => {
  await act(async () =>
    root.render(<EventSetup eventId="active" onCreated={vi.fn()} />),
  );
  const deletions = () =>
    vi
      .mocked(adminFetch)
      .mock.calls.filter(([, init]) => init?.method === 'DELETE');
  await act(async () => button('Bankverbindung entfernen').click());
  expect(deletions()).toHaveLength(0);
  await act(async () => button('Entfernen rückgängig machen').click());
  expect(input('IBAN').value).toBe(recipient.iban);
  await act(async () => button('Bankverbindung entfernen').click());
  await act(async () => button('Entwurf speichern').click());
  const dialog = container.querySelector('dialog[open]');
  expect(dialog?.textContent).toContain(
    'organisationsweit für alle Veranstaltungen',
  );
  expect(deletions()).toHaveLength(0);
  await act(async () => button('Abbrechen').click());
  expect(container.querySelector('dialog[open]')).toBeNull();
  expect(deletions()).toHaveLength(0);
  await act(async () => button('Entwurf speichern').click());
  await act(async () => button('Entfernen und speichern').click());
  expect(deletions()).toHaveLength(1);
});
