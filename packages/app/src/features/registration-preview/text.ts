import type { Step } from './model.js';
import { translations } from '../registration/registrationTranslations.js';

export type Locale = 'de' | 'en';
export function words(locale: Locale) {
  const existing = translations[locale];
  return {
    ...existing,
    firstName: locale === 'de' ? 'Vorname' : 'First name',
    lastName: locale === 'de' ? 'Nachname' : 'Last name',
    birthDate: locale === 'de' ? 'Geburtsdatum' : 'Date of birth',
    email: locale === 'de' ? 'E-Mail-Adresse' : 'Email address',
    required: locale === 'de' ? 'Erforderlich' : 'Required',
    optional: locale === 'de' ? 'Freiwillig' : 'Optional',
  };
}
export function money(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function stepTitles(locale: Locale): Record<Step, string> {
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  return {
    person: w.aboutYou,
    vehicle: t('Fahrzeug', 'Vehicle'),
    passenger: w.passenger,
    documents: t('Fragen und Nachweise', 'Questions and documents'),
    review: t('Prüfen und absenden', 'Review and submit'),
    payment: t('Zahlung', 'Payment'),
  };
}

export function accentHint(
  notice: 'darkened' | 'lightened' | 'nearSuccess',
  locale: Locale,
) {
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  return {
    darkened: t(
      'Euer Ton wird für Flächen abgedunkelt, damit Text darauf lesbar bleibt. Das Logo bleibt unverändert.',
      'Your colour is darkened for surfaces so that text on it stays readable. The logo remains unchanged.',
    ),
    lightened: t(
      'Euer Ton wird für Flächen aufgehellt, damit er sich von Text unterscheidet. Das Logo bleibt unverändert.',
      'Your colour is lightened for surfaces so that it stays distinct from text. The logo remains unchanged.',
    ),
    nearSuccess: t(
      'Hinweis: Euer Ton liegt nah am Erfolgsgrün. Er bleibt wie gewählt; Statusmeldungen tragen zusätzlich Zeichen und Text.',
      'Note: your colour is close to the success green. It stays as chosen; status messages also carry a symbol and text.',
    ),
  }[notice];
}
