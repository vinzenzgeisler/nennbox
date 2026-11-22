// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultRegistrationFormConfig } from '@nennbox/contracts';
import { RegistrationFormSettings } from './RegistrationFormSettings.js';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});
async function mount(embedded = false, saveFails = false) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: !(saveFails && init?.method === 'PUT'),
    status: 200,
    json: async () =>
      init?.method === 'POST'
        ? { objectId: 'uploaded-logo' }
        : {
            config: {
              ...defaultRegistrationFormConfig,
              customFields: [
                {
                  key: 'existing',
                  type: 'text',
                  label: { de: 'Eigenes Testfeld', en: 'Test field' },
                  required: false,
                },
              ],
            },
          },
  }));
  vi.stubGlobal('fetch', fetch);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <RegistrationFormSettings eventId="event-one" embedded={embedded} />,
    ),
  );
  return fetch;
}
function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )!;
}
function control(text: string) {
  return [...container.querySelectorAll('label')]
    .find(
      (label) =>
        label.firstElementChild?.textContent === text ||
        label.textContent === text,
    )
    ?.querySelector('input,select,textarea') as
    HTMLInputElement | HTMLSelectElement;
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('preserves standard radio selectors, updates the live public preview, and persists event overrides only', async () => {
  const fetch = await mount(true);
  const group = container.querySelector(
    '[role="radiogroup"][aria-label="Blutgruppe"]',
  )!;
  await act(async () =>
    (
      group.querySelector('input[value="required"]') as HTMLInputElement
    ).click(),
  );
  expect(control('Blutgruppe').required).toBe(true);
  expect(container.querySelector('.registration .nb-field')).not.toBeNull();
  await act(async () => button('Änderungen speichern').click());
  const call = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
  expect(call[0]).toBe('/admin/events/event-one/registration-form-config');
  expect(JSON.parse(String(call[1]?.body)).fields).toEqual({
    bloodGroup: { state: 'required' },
  });
  expect(container.textContent).toContain('Einstellungen gespeichert.');
});
it('opens existing custom fields on demand, retains edits while collapsed, and opens added fields immediately', async () => {
  await mount();
  const toggle = container.querySelector(
    '[aria-label="Eigenes Testfeld bearbeiten"]',
  ) as HTMLButtonElement;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(
    container.querySelector('.nb-app-editor-disclosure')?.hasAttribute('inert'),
  ).toBe(true);
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  await act(async () => (control('Pflichtfeld') as HTMLInputElement).click());
  await act(async () => toggle.click());
  await act(async () => toggle.click());
  expect((control('Pflichtfeld') as HTMLInputElement).checked).toBe(true);
  await act(async () => button('Eigenes Feld hinzufügen').click());
  expect(
    container
      .querySelector('[aria-label="Neues Feld bearbeiten"]')
      ?.getAttribute('aria-expanded'),
  ).toBe('true');
  await act(async () => button('Eigenes Feld entfernen').click());
  expect(
    container.querySelector('[aria-label="Eigenes Testfeld bearbeiten"]'),
  ).toBeNull();
});
it('keeps custom field type conversions and payment controls functional', async () => {
  const fetch = await mount();
  await act(async () =>
    (
      container.querySelector(
        '[aria-label="Eigenes Testfeld bearbeiten"]',
      ) as HTMLButtonElement
    ).click(),
  );
  await select(control('Typ') as HTMLSelectElement, 'select');
  expect(control('Optionen · je Zeile Wert|Deutsch|English').value).toBe(
    'option-1|Option 1|Option 1',
  );
  await select(control('Typ') as HTMLSelectElement, 'text');
  expect(control('Optionen · je Zeile Wert|Deutsch|English')).toBeUndefined();
  const card = [...container.querySelectorAll('label')]
    .find((label) => label.textContent === 'Karte')
    ?.querySelector('input');
  if (!card) throw new Error('Missing card method');
  const wasChecked = card.checked;
  await act(async () => card.click());
  await select(control('Geltungsbereich') as HTMLSelectElement, 'organization');
  await act(async () => card.click());
  await act(async () => button('Änderungen speichern').click());
  const call = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
  expect(call[0]).toBe('/admin/organization/registration-form-config');
  expect(
    JSON.parse(String(call[1]?.body)).payments.onlineMethods.includes('card'),
  ).toBe(!wasChecked);
});
it('announces save failures as alerts and successes as status messages', async () => {
  await mount(false, true);
  await act(async () => button('Änderungen speichern').click());
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe('Speichern momentan nicht möglich.');
  expect(alert?.className).toContain('nb-app-notice-error');
  act(() => root.unmount());
  container.remove();
  await mount();
  await act(async () => button('Änderungen speichern').click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[role="status"]')?.className).toContain(
    'nb-app-notice-success',
  );
});
