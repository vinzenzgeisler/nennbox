// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegistrationPreview from './RegistrationPreview.js';
import { sideSurfaceOptions } from './surfaces.js';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<RegistrationPreview />));
});
afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function scenario(name: string) {
  const match = [
    ...container.querySelectorAll<HTMLButtonElement>(
      '.nb-preview-scenarios button',
    ),
  ].find((item) => item.textContent?.trim() === name);
  expect(match, `scenario ${name}`).toBeDefined();
  act(() => match!.click());
}
function select(label: string) {
  const element = [...container.querySelectorAll('select')].find((item) =>
    [...(item.labels ?? [])].some((l) => l.textContent?.includes(label)),
  );
  expect(element, `select ${label}`).toBeDefined();
  return element!;
}
function choose(label: string, value: string) {
  const element = select(label);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const heading = () => container.querySelector('h1,h2')?.textContent;
const hint = () => container.querySelector('.nb-preview-palette-hint');
const style = () =>
  container
    .querySelector<HTMLElement>('.nb-reg')!
    .style.getPropertyValue('--ak');
const logoTile = () => container.querySelector('.nb-preview-logo')?.textContent;

describe('prototype tools reach every state of the design folder', () => {
  it('reaches minor, under-age, full class, two entries, spare vehicle and passenger', () => {
    scenario('Minderjährig');
    expect(container.textContent).toContain('erziehungsberechtigten');
    scenario('Unter Mindestalter');
    expect(container.textContent).toContain('Mindestalter');
    scenario('Ausgebucht');
    expect(heading()).toBe('Fahrzeug');
    expect(container.textContent).toContain('Rennwagen ist ausgebucht');
    scenario('Zwei Startmeldungen');
    expect(container.textContent).toContain('Startmeldung 2');
    scenario('Ersatzfahrzeug');
    expect(container.textContent).toContain(
      'zählt nicht als Startmeldung · 0 €',
    );
    scenario('Beifahrer');
    expect(heading()).toBe('Beifahrer');
    scenario('Upload-Zustände');
    expect(heading()).toBe('Fragen und Nachweise');
    scenario('Datei zu groß');
    expect(heading()).toBe('Fragen und Nachweise');
    scenario('Prüfen');
    expect(heading()).toBe('Prüfen und absenden');
  });

  it('shows every side surface, in both languages, from the select', () => {
    for (const option of sideSurfaceOptions) {
      choose('Nebenfläche', option.value);
      expect(heading(), option.value).toBeTruthy();
      expect(heading(), option.value).not.toBe('Über dich');
    }
    choose('Nebenfläche', '');
    expect(heading()).toBe('Über dich');
    act(() =>
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'EN')!
        .click(),
    );
    expect(container.textContent).toContain('Prototype tools');
  });
});

describe('club customisation (P7/P8)', () => {
  it('switches club identity and derives the accent only through the palette rule', () => {
    expect(logoTile()).toBe('MSC');
    expect(style()).toBe('#1F4E79');
    choose('Beispielverein', 'amc');
    expect(logoTile()).toBe('AMC');
    // 0xC0392B is rewritten by the derivation, never applied verbatim.
    expect(style()).toBe('#BF382A');
    expect(hint()).toBeNull();
  });

  it('tells the club what NENNBOX changed and never blocks it', () => {
    choose('Beispielverein', 'kcs-gelb');
    expect(style()).toBe('#846D00');
    expect(hint()?.getAttribute('data-notice')).toBe('darkened');
    expect(hint()?.textContent).toContain('abgedunkelt');
    choose('Beispielverein', 'rsn-dunkel');
    expect(style()).toBe('#323235');
    expect(hint()?.getAttribute('data-notice')).toBe('lightened');
    choose('Beispielverein', 'msc-gruen');
    expect(style()).toBe('#2E7D32');
    expect(hint()?.getAttribute('data-notice')).toBe('nearSuccess');
    choose('Beispielverein', 'msc');
    expect(hint()).toBeNull();
  });

  it('keeps the form usable with the accent removed', () => {
    const checkbox = [
      ...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
    ].find((item) =>
      item.labels?.[0]?.textContent?.includes('Akzent entfernen'),
    );
    act(() => checkbox!.click());
    expect(style()).toBe('#5A605C');
    expect(container.querySelector('.nb-app-btn-primary')).not.toBeNull();
    act(() => checkbox!.click());
    expect(style()).toBe('#1F4E79');
  });

  it('applies a theme with its own club, and keeps status colours out of the accent', () => {
    choose('Beispielthema', 'kart');
    expect(logoTile()).toBe('KCS');
    const wrapper = container.querySelector<HTMLElement>('.nb-reg')!;
    const names = [...Array(wrapper.style.length).keys()].map((i) =>
      wrapper.style.item(i),
    );
    expect(names.filter((name) => !/^--(ak|preview)/.test(name))).toEqual([]);
    expect(wrapper.getAttribute('style')).not.toMatch(
      /2FA866|E07A1F|B42318|18201C/i,
    );
  });
});
