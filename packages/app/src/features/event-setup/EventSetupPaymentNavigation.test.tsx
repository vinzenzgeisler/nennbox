// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  defaultRegistrationFormConfig,
  type RegistrationFormConfigPatch,
} from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';
import { EventSetup } from './EventSetup.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let patch: RegistrationFormConfigPatch;
const event = {
  id: 'event-1',
  name: 'Frühlingsfahrt',
  slug: 'fruehlingsfahrt',
  startsOn: '2027-05-01',
  endsOn: '2027-05-02',
  status: 'draft',
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  });
const button = (text: string) =>
  [...container.querySelectorAll('button')].find(
    (node) => node.textContent === text,
  )!;
async function navigate(label: string) {
  const link = [...container.querySelectorAll<HTMLAnchorElement>('nav a')].find(
    (node) => node.textContent?.includes(label),
  )!;
  await act(async () => link.click());
  expect(link.getAttribute('aria-current')).toBe('true');
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = vi.fn();
  patch = {};
  vi.mocked(adminFetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/admin/events') return json([event]);
    if (url === '/admin/events/event-1') return json(event);
    if (url.endsWith('/registration-form-config')) {
      if (url.includes('/organization/'))
        return json({ config: defaultRegistrationFormConfig });
      if (init?.method === 'PUT') {
        patch = JSON.parse(String(init.body)) as RegistrationFormConfigPatch;
        return json({ config: patch });
      }
      return json({ config: patch });
    }
    if (url.endsWith('/classes') || url.endsWith('/pricing')) return json([]);
    if (url.endsWith('/consents')) return json({ terms: [] });
    if (url.endsWith('/payment-recipient')) return json({ recipient: null });
    throw new Error(`Unexpected request: ${url}`);
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<EventSetup eventId="event-1" onCreated={vi.fn()} />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('places payment methods, refund rules and their inheritance under Veranstalter und Zahlung, preserving field edits across navigation', async () => {
  await navigate('Veranstalter und Zahlung');
  const organizer = container.querySelector('#event-setup-organizer')!;
  expect(organizer.closest('[hidden]')).toBeNull();
  expect(organizer.textContent).toContain(
    'Zahlungsarten für diese Veranstaltung',
  );
  expect(organizer.textContent).toContain(
    'Online-Zahlungen bei Absage automatisch erstatten',
  );
  expect(organizer.textContent).toContain(
    'Zahlungsarten und Erstattungsregel von Organisation übernehmen',
  );

  await navigate('Formularfelder');
  const fields = container.querySelector('#event-setup-form-fields')!;
  expect(fields.textContent).not.toContain('Zahlungsarten');
  expect(fields.textContent).not.toContain('automatisch erstatten');
  expect(organizer.closest('[hidden]')).not.toBeNull();
  await act(async () =>
    fields
      .querySelector<HTMLInputElement>(
        '[role="radiogroup"][aria-label="Blutgruppe"] input[value="required"]',
      )!
      .click(),
  );
  await act(async () => button('Änderungen speichern').click());
  expect(patch.fields).toEqual({ bloodGroup: { state: 'required' } });

  await navigate('Veranstalter und Zahlung');
  const card = [...organizer.querySelectorAll('label')]
    .find((label) => label.textContent === 'Karte')!
    .querySelector('input')!;
  await act(async () => card.click());
  await act(async () => button('Zahlungseinstellungen speichern').click());
  expect(patch.fields).toEqual({ bloodGroup: { state: 'required' } });
  expect(patch.payments?.onlineMethods).toEqual(['card']);

  await navigate('Formularfelder');
  expect(
    container.querySelector<HTMLInputElement>(
      '#event-setup-form-fields [aria-label="Blutgruppe"] input[value="required"]',
    )?.checked,
  ).toBe(true);
  await act(async () => button('Änderungen speichern').click());
  expect(patch.payments?.onlineMethods).toEqual(['card']);
});
