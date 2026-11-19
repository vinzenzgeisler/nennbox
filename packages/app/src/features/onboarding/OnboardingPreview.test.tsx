// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingPreview } from './OnboardingPreview.js';
import { storageKey } from './state.js';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<OnboardingPreview />));
});
afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
});

const heading = () => container.querySelector('h1')!.textContent;
const button = (name: string | RegExp) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    typeof name === 'string'
      ? item.textContent?.trim() === name
      : name.test(item.textContent ?? ''),
  )!;
const click = (element: Element) => act(() => (element as HTMLElement).click());
const type = (label: string, value: string) => {
  const input = [...container.querySelectorAll<HTMLInputElement>('input')].find(
    (item) => item.closest('label')?.textContent?.includes(label),
  )!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const pick = (title: string) =>
  click(
    [...container.querySelectorAll('.nb-choice-card-main')].find((card) =>
      card.textContent?.includes(title),
    )!,
  );
const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

describe('onboarding prototype', () => {
  it('starts with the account question and cannot continue before an answer', () => {
    expect(heading()).toBe('Wie willst du dich anmelden?');
    expect(button('Weiter').disabled).toBe(true);
    expect(container.querySelector('[role=radiogroup]')).not.toBeNull();
    pick('Passkey');
    expect(button('Weiter').disabled).toBe(false);
  });

  it('shows the live preview and keeps the progress bar in sync', () => {
    const progress = container.querySelector(
      'nav[aria-label="Fortschritt der Einrichtung"]',
    )!;
    expect(progress.querySelectorAll('li')).toHaveLength(7);
    expect(
      progress.querySelector('[aria-current=step]')?.textContent,
    ).toContain('Konto');
    expect(container.querySelector('.nb-live')).not.toBeNull();
  });

  it('checks the club address, builds the preview and adapts the follow-up questions', () => {
    press('1');
    press('Enter');
    expect(heading()).toBe('Wie heißt euer Verein?');
    type('Vereinsname', 'MSC Beispielstadt e. V.');
    expect(container.textContent).toContain('schon vergeben');
    expect(button('Weiter').disabled).toBe(true);
    click(button(/msc-beispielstadt-2\.nennbox\.com verwenden/));
    expect(container.textContent).toContain('Adresse ist frei');
    expect(button('Weiter').disabled).toBe(false);
    type('Vereinsname', 'MSC Hohenstein e. V.');
    expect(container.querySelector('.nb-live-viewport')?.textContent).toContain(
      'MSC Hohenstein e. V.',
    );
    press('Enter');
    click(button('Überspringen'));
    expect(heading()).toBe('Was veranstaltet ihr?');
    pick('Kart');
    press('Enter');
    expect(heading()).toBe('Wer startet bei euch?');
    press('Enter');
    // Karts have no vehicle history questions: straight to the field size.
    expect(heading()).toBe('Wie viele Starter erwartet ihr?');
    click(button('Zurück'));
    click(button('Zurück'));
    expect(heading()).toBe('Was veranstaltet ihr?');
    pick('Rallye');
    press('Enter');
    press('Enter');
    expect(heading()).toBe('Welche Fahrzeuge starten?');
  });

  it('restores the saved answers after a reload', () => {
    pick('Code per E-Mail');
    const saved = JSON.parse(window.localStorage.getItem(storageKey)!);
    expect(saved.answers.authMethod).toBe('email-code');
    act(() => root!.unmount());
    root = createRoot(container);
    act(() => root!.render(<OnboardingPreview />));
    const radio = container.querySelector<HTMLInputElement>(
      'input[value="email-code"]',
    )!;
    expect(radio.checked).toBe(true);
  });
});
