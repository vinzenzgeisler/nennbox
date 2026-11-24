// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRegistrationFormConfig } from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';
import { EventPaymentSettings } from './EventPaymentSettings.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const json = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const puts = () =>
  vi.mocked(adminFetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  )!;
const checkbox = (label: string) =>
  [...container.querySelectorAll('label')]
    .find((node) => node.textContent === label)!
    .querySelector('input')!;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(adminFetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === 'PUT') return json({});
    return url.includes('/events/')
      ? json({ config: {} })
      : json({ config: defaultRegistrationFormConfig });
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<EventPaymentSettings eventId="event-1" />),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('payment settings in the event setup', () => {
  it('offers payment methods and the refund rule of this event', () => {
    expect(container.textContent).toContain(
      'Zahlungsarten für diese Veranstaltung',
    );
    expect(container.textContent).toContain('Überweisung anbieten');
    expect(container.textContent).toContain(
      'Online-Zahlungen bei Absage automatisch erstatten',
    );
  });

  it('saves only the event override for the payments the organizer changed', async () => {
    await act(async () => checkbox('Karte').click());
    await act(async () => button('Zahlungseinstellungen speichern').click());
    expect(puts()).toHaveLength(1);
    const [url, init] = puts()[0]!;
    expect(url).toBe('/admin/events/event-1/registration-form-config');
    expect(JSON.parse(String(init?.body))).toEqual({
      payments: { onlineMethods: ['card'], bankTransfer: true },
    });
    expect(container.textContent).toContain(
      'Zahlungseinstellungen gespeichert.',
    );
  });

  it('refuses to save an incomplete refund rule and says what is missing', async () => {
    await act(async () =>
      checkbox('Online-Zahlungen bei Absage automatisch erstatten').click(),
    );
    await act(async () => button('Stufe hinzufügen').click());
    const percent = container.querySelectorAll<HTMLInputElement>(
      'input:not([type="checkbox"])',
    )[1]!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(percent, '');
      percent.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Zahlungseinstellungen speichern').click());
    expect(puts()).toHaveLength(0);
    expect(container.textContent).toContain(
      'Bitte fülle bei jeder Erstattungsstufe',
    );
    expect(container.textContent).toContain('Bitte eine ganze Zahl angeben.');
  });

  it('tells the organizer when saving failed', async () => {
    vi.mocked(adminFetch).mockImplementation(async (input, init) =>
      init?.method === 'PUT'
        ? json({}, 500)
        : String(input).includes('/events/')
          ? json({ config: {} })
          : json({ config: defaultRegistrationFormConfig }),
    );
    await act(async () => button('Zahlungseinstellungen speichern').click());
    expect(container.textContent).toContain(
      'Zahlungseinstellungen konnten nicht gespeichert werden.',
    );
  });
});

it('can inherit organization payments again without leaving stale refund drafts', async () => {
  await act(async () =>
    checkbox('Online-Zahlungen bei Absage automatisch erstatten').click(),
  );
  await act(async () => button('Stufe hinzufügen').click());
  await act(async () =>
    button(
      'Zahlungsarten und Erstattungsregel von Organisation übernehmen',
    ).click(),
  );
  expect(container.textContent).not.toContain('Stufe entfernen');
  await act(async () => button('Zahlungseinstellungen speichern').click());
  expect(JSON.parse(String(puts()[0]![1]?.body))).toEqual({});
  await act(async () =>
    checkbox('Online-Zahlungen bei Absage automatisch erstatten').click(),
  );
  expect(container.textContent).not.toContain('Stufe entfernen');
});

it('does not overwrite field settings when the latest config cannot be loaded', async () => {
  vi.mocked(adminFetch).mockResolvedValue(new Response('{}', { status: 500 }));
  await act(async () => button('Zahlungseinstellungen speichern').click());
  expect(puts()).toHaveLength(0);
  expect(container.textContent).toContain(
    'Zahlungseinstellungen konnten nicht gespeichert werden.',
  );
});
