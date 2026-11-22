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

const skip = () => click(button(/Überspringen/));
/** Walks the setup with suggestions up to the screen with the given heading. */
const walkTo = (title: string, kind = 'Bergrennen') => {
  pick('Passkey');
  click(button('Weiter'));
  type('Vereinsname', 'MSC Hohenstein e. V.');
  click(button('Weiter'));
  skip();
  pick(kind);
  click(button('Weiter'));
  for (let guard = 0; guard < 20 && heading() !== title; guard++) {
    if (heading() === 'Das füllen eure Teilnehmer aus') click(button('Weiter'));
    else if (heading() === 'Wann und wo findet es statt?') {
      type('Datum', '2027-04-26');
      type('Ort', 'Bergstrecke Hohenstein');
      click(button('Weiter'));
    } else skip();
  }
  expect(heading()).toBe(title);
};

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
    // Karts have no vehicle history questions: straight to the languages.
    expect(heading()).toBe('In welchen Sprachen nennt man bei euch?');
    click(button(/Überspringen/));
    expect(heading()).toBe('Darf ein Fahrer mehrfach starten?');
    click(button('Zurück'));
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

  it('offers German as the fixed main language and English as the recommendation', () => {
    walkTo('In welchen Sprachen nennt man bei euch?');
    const german = [...container.querySelectorAll('.nb-choice-card')].find(
      (card) => card.textContent?.includes('Deutsch'),
    )!;
    expect(german.textContent).toContain('Hauptsprache');
    expect(german.querySelector<HTMLInputElement>('input')!.disabled).toBe(
      true,
    );
    const italian = [...container.querySelectorAll('.nb-choice-card')].find(
      (card) => card.textContent?.includes('Italienisch'),
    )!;
    expect(italian.textContent).toContain('Noch nicht verfügbar');
    expect(row('Sprachen')?.value).toBe('noch offen');
    pick('Englisch');
    expect(row('Sprachen')?.value).toBe('Deutsch, Englisch');
    expect(container.textContent).toContain('Das übersetzt ihr selbst');
    expect(container.textContent).toContain('Klassennamen');
  });

  it('keeps "nur Deutsch" when continuing without a pick and takes English with "Überspringen"', () => {
    walkTo('In welchen Sprachen nennt man bei euch?');
    expect(button('Weiter').disabled).toBe(false);
    click(button('Weiter'));
    expect(
      JSON.parse(window.localStorage.getItem(storageKey)!).answers.languages,
    ).toEqual([]);
    expect(row('Sprachen')?.value).toBe('Nur Deutsch');
    expect(container.textContent).not.toContain('Das übersetzt ihr selbst');
    click(button('Zurück'));
    pick('Englisch');
    click(button('Zurück'));
    click(button('Weiter'));
    expect(row('Sprachen')?.value).toBe('Deutsch, Englisch');
  });

  it('shows the whole registration form and lets optional fields be turned off, required ones not', () => {
    walkTo('Das füllen eure Teilnehmer aus');
    const names = () =>
      [...container.querySelectorAll('.nb-onb-form-name')].map(
        (item) => item.firstChild?.textContent,
      );
    expect(names()).toContain('Lizenznummer');
    expect(names()).toContain('Telefon');
    const rowOf = (name: string) =>
      [...container.querySelectorAll('.nb-onb-form-row')].find(
        (item) =>
          item.querySelector('.nb-onb-form-name')?.firstChild?.textContent ===
          name,
      )!;
    expect(rowOf('Lizenznummer').querySelector('[role=switch]')).toBeNull();
    expect(rowOf('Geburtsdatum').querySelector('[role=switch]')).toBeNull();
    const phone =
      rowOf('Telefon').querySelector<HTMLInputElement>('[role=switch]')!;
    expect(phone.checked).toBe(true);
    const total = container.querySelector('.nb-onb-stats dd')!.textContent;
    act(() => phone.click());
    expect(rowOf('Telefon').classList.contains('is-off')).toBe(true);
    expect(rowOf('Telefon').textContent).toContain('Abgeschaltet');
    expect(
      Number(container.querySelector('.nb-onb-stats dd')!.textContent),
    ).toBe(Number(total) - 1);
    expect(
      JSON.parse(window.localStorage.getItem(storageKey)!).answers.hiddenFields,
    ).toContain('phone');
    expect(container.querySelector('.nb-emerging')!.textContent).toContain(
      'Abgeschaltet',
    );
    act(() => phone.click());
    expect(rowOf('Telefon').classList.contains('is-off')).toBe(false);
  });

  it('ends in a draft: summary with real preview tabs, then "Euer Entwurf steht"', () => {
    walkTo('Alles bereit zum Öffnen?');
    expect(container.querySelector('.nb-emerging')).toBeNull();
    expect(container.querySelector('.nb-onb-browser')).not.toBeNull();
    expect(
      container.querySelector('.nb-onb-browser-bar')!.textContent,
    ).toContain('msc-hohenstein.nennbox.com/events/');
    const tabs = [...container.querySelectorAll('.nb-app-segmented button')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Veranstaltungsseite',
      'Nennformular',
    ]);
    click(tabs[1]!);
    expect(
      container.querySelector('.nb-onb-browser-bar')!.textContent,
    ).toContain('/register');
    expect(container.textContent).toContain('Nennformular');
    expect(button('Entwurf anlegen')).toBeDefined();
    pick('Jetzt öffnen');
    expect(button('Nennung öffnen')).toBeDefined();
    pick('Erst als Entwurf');
    click(button('Entwurf anlegen'));
    expect(heading()).toBe('Euer Entwurf steht.');
    expect(container.textContent).toContain('Vorschau-Link');
    expect(container.textContent).toContain('Bereit zum Öffnen?');
    expect(container.textContent).toContain('Teilnahmebedingungen geprüft');
    expect(container.querySelector('.nb-emerging')).toBeNull();
    click(button('Nennung jetzt öffnen'));
    expect(heading()).toBe('Eure Nennung ist offen.');
  });
});
