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
    (item) => item.labels?.[0]?.textContent?.includes(label),
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

const rows = () =>
  [...container.querySelectorAll('.nb-emerging-fact')].map((row) => ({
    label: row.querySelector('.nb-emerging-label')!.textContent,
    value: row.querySelector('.nb-emerging-value')!.textContent!,
  }));
const row = (label: string) => rows().find((item) => item.label === label);

describe('onboarding prototype', () => {
  it('starts with the account question and cannot continue before an answer', () => {
    expect(heading()).toBe('Wie willst du dich anmelden?');
    expect(button('Weiter').disabled).toBe(true);
    expect(container.querySelector('[role=radiogroup]')).not.toBeNull();
    pick('Passkey');
    expect(button('Weiter').disabled).toBe(false);
  });

  it('shows six sections and "Das entsteht" instead of a live preview', () => {
    const sections = container.querySelector(
      'nav[aria-label="Abschnitte der Einrichtung"]',
    )!;
    const names = [...sections.querySelectorAll(':scope > ol > li')].map(
      (item) => item.querySelector('.nb-onb-section')!.textContent,
    );
    expect(names).toEqual([
      '1Konto',
      '2Verein',
      '3Veranstaltung',
      '4Teilnehmer',
      '5Nennung',
      '6Veröffentlichen',
    ]);
    expect(
      sections.querySelector('[aria-current=step]')?.textContent,
    ).toContain('Konto');
    expect(container.querySelector('.nb-live')).toBeNull();
    expect(container.querySelector('.nb-emerging h2')?.textContent).toBe(
      'Eure Veranstaltung',
    );
    expect(row('Art')?.value).toBe('noch offen');
    expect(container.textContent).toContain('Noch etwa');
    expect(container.textContent).toContain('Schirm 1 von');
  });

  it('checks the club address and adapts the follow-up questions', () => {
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
    expect(row('Verein')?.value).toBe('MSC Hohenstein e. V.');
    press('Enter');
    click(button(/Überspringen/));
    expect(heading()).toBe('Was veranstaltet ihr?');
    pick('Kart');
    expect(row('Art')?.value).toBe('Kart');
    press('Enter');
    expect(heading()).toBe('Wer startet bei euch?');
    // Nothing chosen: Enter and "Weiter" wait, "Überspringen" takes the suggestion.
    press('Enter');
    expect(heading()).toBe('Wer startet bei euch?');
    expect(button('Weiter').disabled).toBe(true);
    click(button(/Überspringen/));
    // Karts have no vehicle history questions: straight to the run.
    expect(heading()).toBe('Darf ein Fahrer mehrfach starten?');
    click(button('Zurück'));
    click(button('Zurück'));
    expect(heading()).toBe('Was veranstaltet ihr?');
    pick('Rallye');
    press('Enter');
    click(button(/Überspringen/));
    expect(heading()).toBe('Welche Fahrzeuge starten?');
  });

  it('marks the recommendation and applies it with "Überspringen"', () => {
    pick('Passkey');
    click(button('Weiter'));
    type('Vereinsname', 'MSC Hohenstein e. V.');
    click(button('Weiter'));
    click(button(/Überspringen/));
    pick('Bergrennen');
    click(button('Weiter'));
    expect(heading()).toBe('Wer startet bei euch?');
    const recommended = container.querySelector('.nb-choice-card-badge')!;
    expect(recommended.textContent).toBe('Empfohlen');
    expect(recommended.closest('.nb-choice-card')?.textContent).toContain(
      'Lizenzfahrer',
    );
    expect(row('Starter')?.value).toBe('noch offen');
    click(button(/Überspringen/));
    expect(row('Starter')?.value).toBe('Lizenzfahrer');
    click(button('Zurück'));
    const checked = container.querySelector<HTMLInputElement>(
      'input[type=radio]:checked',
    )!;
    expect(checked.value).toBe('licensed');
    expect(button('Weiter').disabled).toBe(false);
  });

  it('shows the consequence on every card and the example of the chosen one', () => {
    pick('Passkey');
    click(button('Weiter'));
    type('Vereinsname', 'MSC Hohenstein e. V.');
    click(button('Weiter'));
    click(button(/Überspringen/));
    const first = container.querySelector('.nb-choice-card')!;
    expect(
      first
        .querySelector('.nb-choice-card-consequence')
        ?.textContent?.replaceAll('\u00a0', ' '),
    ).toBe('4 Klassen nach Hubraum, ab 80 €, Nummern 1 bis 199');
    pick('Bergrennen');
    expect(
      container.querySelector('.nb-question-example')?.textContent,
    ).toContain('Historischer Bergpreis');
    expect(row('Klassen')?.value.replaceAll('\u00a0', ' ')).toContain(
      '4 vorgeschlagen, ab 80 €',
    );
  });

  it('restores a selected logo and clears it when the prototype restarts', () => {
    pick('Mit Google');
    click(button('Weiter'));
    type('Vereinsname', 'MSC Hohenstein e. V.');
    click(button('Weiter'));
    click(button(/Blau und Gelb/));
    expect(container.querySelector('.nb-onb-upload-art img')).not.toBeNull();
    expect(row('Farben')?.value).toBe('Aus dem Logo');
    act(() => root!.unmount());
    root = createRoot(container);
    act(() => root!.render(<OnboardingPreview />));
    expect(container.querySelector('.nb-onb-upload-art img')).not.toBeNull();
    click(button('Neu'));
    expect(heading()).toBe('Wie willst du dich anmelden?');
    expect(
      window.localStorage.getItem('nennbox.onboarding-preview.logo.v1'),
    ).toBeNull();
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

  it('parks the setup with "Später fortsetzen" and resumes where it stopped', () => {
    pick('Passkey');
    click(button('Weiter'));
    click(button('Später fortsetzen'));
    expect(heading()).toBe('Dein Stand ist gespeichert');
    expect(container.querySelector('.nb-emerging')).toBeNull();
    click(button('Weitermachen'));
    expect(heading()).toBe('Wie heißt euer Verein?');
  });
});
