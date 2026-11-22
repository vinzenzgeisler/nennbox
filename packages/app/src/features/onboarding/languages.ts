import type { EventLanguage } from '@nennbox/contracts';

export type LanguageOption = {
  code: string;
  short: string;
  title: string;
  description: string;
  consequence: string;
  /** Offered by the reference but not yet by the registration form. */
  available: boolean;
};

/**
 * Languages the reference shows. The registration form and its mails exist in German
 * and English today, so the others stay visible but cannot be chosen yet.
 */
export const languageOptions: LanguageOption[] = [
  {
    code: 'de',
    short: 'DE',
    title: 'Deutsch',
    description: 'Eure Hauptsprache. Alles ist zuerst auf Deutsch da.',
    consequence: 'Formular, Mails und Veranstaltungsseite auf Deutsch',
    available: true,
  },
  {
    code: 'en',
    short: 'EN',
    title: 'Englisch',
    description: 'Deckt die meisten Gäste aus dem Ausland ab.',
    consequence: 'Zweite Sprache im Formular, Mails auf Englisch',
    available: true,
  },
  {
    code: 'it',
    short: 'IT',
    title: 'Italienisch',
    description: 'Häufig bei Bergrennen im Alpenraum.',
    consequence: 'Dritte Sprache im Formular und in den Mails',
    available: false,
  },
  {
    code: 'cs',
    short: 'CS',
    title: 'Tschechisch',
    description: 'Viele Starter bei Veranstaltungen nahe der Grenze.',
    consequence: 'Weitere Sprache im Formular und in den Mails',
    available: false,
  },
  {
    code: 'nl',
    short: 'NL',
    title: 'Niederländisch',
    description: 'Starke Oldtimer-Szene in den Niederlanden.',
    consequence: 'Weitere Sprache im Formular und in den Mails',
    available: false,
  },
  {
    code: 'fr',
    short: 'FR',
    title: 'Französisch',
    description: 'Für Starter aus Frankreich, Belgien und der Schweiz.',
    consequence: 'Weitere Sprache im Formular und in den Mails',
    available: false,
  },
];

export const languageName = (code: string) =>
  languageOptions.find((option) => option.code === code)?.title ?? code;

/** "Nur Deutsch" or "Deutsch, Englisch". */
export const languageSummary = (languages: EventLanguage[]) =>
  languages.length <= 1
    ? 'Nur Deutsch'
    : languages.map((code) => languageName(code)).join(', ');
