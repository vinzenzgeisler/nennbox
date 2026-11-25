// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegistrationPreview from './RegistrationPreview.js';
import { createDraft, type Draft } from './model.js';
import { draftStorageKey } from './useDraft.js';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let frames: FrameRequestCallback[];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Flush focus callbacks after React has committed the destination DOM.
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function mount(draft?: Draft) {
  if (draft) localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  root = createRoot(container);
  act(() => root!.render(<RegistrationPreview />));
}
function button(name: string | RegExp) {
  const match = [
    ...container.querySelectorAll<HTMLButtonElement>('button'),
  ].find((item) =>
    typeof name === 'string'
      ? item.textContent?.trim() === name
      : name.test(item.textContent ?? ''),
  );
  expect(match, `button ${name}`).toBeDefined();
  return match!;
}
function click(element: HTMLElement) {
  act(() => element.click());
  act(() => frames.splice(0).forEach((callback) => callback(0)));
}
function input(id: string) {
  const element = document.getElementById(id);
  expect(element, `input ${id}`).toBeInstanceOf(HTMLInputElement);
  return element as HTMLInputElement;
}
function type(element: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function check(label: string) {
  const control = [
    ...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
  ].find((item) =>
    [...(item.labels ?? [])].some(
      (labelElement) => labelElement.textContent?.trim() === label,
    ),
  );
  expect(control, `checkbox ${label}`).toBeDefined();
  click(control!);
}
const heading = () => container.querySelector('h1')?.textContent;
const stepLabels = () =>
  [...container.querySelectorAll('nav[aria-label="Schritte"] li')].map(
    (item) => item.textContent,
  );

describe('registration preview interactions', () => {
  it('validates on blur rather than typing and clears an error when corrected', () => {
    mount();
    const email = input('person.email');
    act(() => email.focus());
    type(email, 'not-an-email');
    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(document.getElementById('person.email-error')).toBeNull();
    expect(container.querySelector('[role=alert]')).toBeNull();

    act(() => email.blur());
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById('person.email-error')?.textContent,
    ).toContain('gültige E-Mail-Adresse');
    expect(email.getAttribute('aria-describedby')).toBe('person.email-error');

    type(email, 'driver@example.test');
    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(document.getElementById('person.email-error')).toBeNull();
    expect(input('person.firstName').hasAttribute('aria-invalid')).toBe(false);
  });

  it('summarises submit errors, focuses the summary, and jumps to the first invalid field', () => {
    mount();
    type(input('person.firstName'), '');
    type(input('person.email'), 'invalid');
    click(button('Weiter'));
    expect(heading()).toBe('Über dich');
    const summary = container.querySelector<HTMLElement>('[role=alert]')!;
    expect(summary.textContent).toContain('2 Angaben');
    expect(document.activeElement).toBe(summary);
    click(button('Zum ersten fehlenden Feld springen'));
    expect(document.activeElement).toBe(input('person.firstName'));
    type(input('person.firstName'), 'Alex');
    click(button('Zum ersten fehlenden Feld springen'));
    expect(document.activeElement).toBe(input('person.email'));
    type(input('person.email'), 'alex@example.test');
    expect(container.querySelector('[role=alert]')).toBeNull();
    click(button('Weiter'));
    expect(heading()).toBe('Fahrzeug');
  });

  it('starts every consent unchecked and requires each one independently', () => {
    mount();
    click(button('Prüfen'));
    const keys = ['terms', 'privacy', 'organizer'];
    expect(keys.map((key) => input(`consents.${key}`).checked)).toEqual([
      false,
      false,
      false,
    ]);
    click(input('consents.terms'));
    expect(keys.map((key) => input(`consents.${key}`).checked)).toEqual([
      true,
      false,
      false,
    ]);
    click(button(/Nennung absenden/));
    expect(heading()).toBe('Prüfen und absenden');
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      '2 Angaben',
    );
    click(input('consents.privacy'));
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      '1 Angaben',
    );
    click(input('consents.organizer'));
    expect(container.querySelector('[role=alert]')).toBeNull();
    click(button(/Nennung absenden/));
    expect(heading()).not.toBe('Prüfen und absenden');
  });

  it('omits empty passenger and document steps and adds payment only when configured', () => {
    const draft = createDraft();
    draft.entries[0]!.classId = 'motorcycle';
    mount(draft);
    expect(stepLabels().join(' ')).not.toContain('Beifahrer');
    expect(stepLabels().join(' ')).toContain('Fragen und Nachweise');
    check('Vereinsfragen');
    expect(stepLabels().join(' ')).toContain('Fragen und Nachweise');
    check('Nachweise');
    expect(stepLabels()).toHaveLength(3);
    expect(stepLabels().join(' ')).not.toContain('Fragen und Nachweise');
    expect(stepLabels().join(' ')).not.toContain('Zahlung');
    check('Sofortzahlung');
    expect(stepLabels().join(' ')).toContain('Zahlung');
    check('Sofortzahlung');
    click(button('Weiter'));
    expect(heading()).toBe('Fahrzeug');
    click(button('Weiter'));
    expect(heading()).toBe('Prüfen und absenden');
  });

  it('charges two entries separately but never charges for a replacement vehicle', () => {
    mount();
    click(button('Zwei Startmeldungen'));
    const summary = container.querySelector(
      'aside[aria-label="Deine Nennung"]',
    )!;
    expect(summary.textContent?.replaceAll('\u00a0', ' ')).toContain('190,00');
    expect(
      container.querySelector('.nb-reg-summary-toggle')?.textContent,
    ).toContain('2 Startmeldungen');
    click(button(/Ersatzfahrzeug erfassen/));
    expect(summary.textContent).toContain('Ersatzfahrzeug · 0 €');
    expect(summary.textContent?.replaceAll('\u00a0', ' ')).toContain('190,00');
    expect(
      container.querySelector('.nb-reg-summary-toggle')?.textContent,
    ).toContain('2 Startmeldungen');
    expect(
      JSON.parse(localStorage.getItem(draftStorageKey)!).entries,
    ).toHaveLength(2);
  });

  it('keeps edited answers across language toggles and restores them after remounting', () => {
    mount();
    type(input('person.firstName'), 'Alex');
    click(button('EN'));
    expect(heading()).toBe('About you');
    expect(button('EN').getAttribute('aria-pressed')).toBe('true');
    expect(input('person.firstName').value).toBe('Alex');
    type(input('person.city'), 'London');
    click(button('DE'));
    expect(heading()).toBe('Über dich');
    expect(input('person.city').value).toBe('London');
    const saved = JSON.parse(localStorage.getItem(draftStorageKey)!);
    expect(saved.person.firstName).toBe('Alex');
    expect(saved.person.city).toBe('London');
    act(() => root!.unmount());
    root = undefined;
    mount();
    expect(input('person.firstName').value).toBe('Alex');
    expect(input('person.city').value).toBe('London');
  });

  it.each([
    '{broken-json',
    'null',
    '{"person":{}}',
    JSON.stringify({ ...createDraft(), entries: [] }),
  ])('safely replaces an invalid stored draft: %s', (raw) => {
    localStorage.setItem(draftStorageKey, raw);
    mount();
    expect(heading()).toBe('Über dich');
    expect(input('person.firstName').value).toBe(
      createDraft().person.firstName,
    );
    expect(JSON.parse(localStorage.getItem(draftStorageKey)!)).toEqual(
      createDraft(),
    );
  });

  it('remains editable when localStorage access is denied and reports unsaved state', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    mount();
    expect(container.textContent).toContain(
      'Nur diese Sitzung · Speichern nicht möglich',
    );
    expect(container.textContent).not.toContain('Entwurf gespeichert');
    type(input('person.firstName'), 'Session only');
    expect(input('person.firstName').value).toBe('Session only');
  });
});
