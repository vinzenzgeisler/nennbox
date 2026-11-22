import {
  eventTemplate,
  type OnboardingAnswers,
  type ResolvedAnswers,
} from '@nennbox/contracts';
import type { IconName } from './icons.js';
import { kindStep } from './choices-kind.js';

const rangeOf = (resolved: ResolvedAnswers) => {
  const { from, to } = eventTemplate(resolved.kind).startNumberRange;
  return `${from} bis ${to}`;
};

export type ChoiceOption = {
  value: string;
  icon: IconName;
  title: string;
  description: string;
  /** What choosing this card does; shown on the card. */
  consequence?: string | ((resolved: ResolvedAnswers) => string);
  /** Concrete example shown below the cards once the card is chosen. */
  example: string;
};

/** A screen that is one question with a handful of cards; the answer lives in `field`. */
export type ChoiceStep = {
  /** Short topic shown above the question, next to the step counter. */
  topic: string;
  title: string;
  lead?: string;
  field: keyof OnboardingAnswers;
  /** Answers stored as booleans map "yes"/"no" cards to true/false. */
  boolean?: boolean;
  columns?: 2 | 3;
  options: ChoiceOption[];
};

export const choiceSteps = {
  account: {
    topic: 'Konto',
    title: 'Wie willst du dich anmelden?',
    lead: 'Du brauchst kein neues Passwort. Weitere Anmeldewege kannst du später hinzufügen.',
    field: 'authMethod',
    options: [
      {
        value: 'google',
        icon: 'google',
        title: 'Mit Google',
        description: 'Ein Klick mit deinem Google-Konto.',
        example:
          'Du wählst dein Google-Konto aus und bestätigst. NENNBOX erhält nur Name und E-Mail-Adresse.',
      },
      {
        value: 'passkey',
        icon: 'passkey',
        title: 'Mit Passkey',
        description: 'Fingerabdruck, Gesicht oder Geräte-PIN.',
        example:
          'Auf dem Handy bestätigst du mit Face ID oder Fingerabdruck. Es gibt kein Passwort, das jemand erraten kann.',
      },
      {
        value: 'email-code',
        icon: 'email-code',
        title: 'Code per E-Mail',
        description: 'Wir senden dir einen sechsstelligen Code.',
        example:
          'Du gibst deine E-Mail-Adresse ein, wir senden „482 915“. Den Code tippst du ein, fertig.',
      },
    ],
  },
  kind: kindStep,
  starters: {
    topic: 'Starter',
    title: 'Wer startet bei euch?',
    lead: 'Das entscheidet, ob eine Lizenz abgefragt wird und welche Unterlagen nötig sind.',
    field: 'starters',
    columns: 3,
    options: [
      {
        value: 'licensed',
        icon: 'licensed',
        consequence:
          'Lizenznummer wird Pflicht, Kopie der Lizenz wird verlangt',
        title: 'Lizenzfahrer',
        description: 'Nur Fahrer mit gültiger Rennlizenz.',
        example:
          'Lizenznummer wird Pflicht, eine Kopie der Lizenz wird als Unterlage verlangt.',
      },
      {
        value: 'clubsport',
        icon: 'clubsport',
        consequence: 'Lizenznummer freiwillig, Clubausweis möglich',
        title: 'Clubsport',
        description: 'Mitglieder eures und befreundeter Clubs.',
        example:
          'Die Lizenznummer ist freiwillig. Ein Clubausweis kann hochgeladen werden.',
      },
      {
        value: 'guests',
        icon: 'guests',
        consequence: 'Kein Lizenzfeld, keine Lizenzunterlagen',
        title: 'Gäste ohne Lizenz',
        description: 'Jeder darf starten, ihr fragt keine Lizenz ab.',
        example:
          'Das Lizenzfeld verschwindet aus dem Formular, es sind keine Lizenzunterlagen nötig.',
      },
    ],
  },
  'vehicle-era': {
    topic: 'Fahrzeuge',
    title: 'Welche Fahrzeuge starten?',
    lead: 'Bei historischen Fahrzeugen fragt NENNBOX Baujahr und Fahrzeugpass ab.',
    field: 'vehicleEra',
    columns: 3,
    options: [
      {
        value: 'historic',
        icon: 'historic',
        consequence: 'Baujahr wird Pflicht, Fahrzeugpass wird verlangt',
        title: 'Historisch',
        description: 'Fahrzeuge bis zu einem Baujahr, mit Fahrzeugpass.',
        example:
          'Ein Oldtimer von 1958 braucht den Fahrzeugpass. Er wird beim Nennen hochgeladen und von euch geprüft.',
      },
      {
        value: 'modern',
        icon: 'modern',
        consequence: 'Nur Fahrzeugschein und Klasse, kein Fahrzeugpass',
        title: 'Modern',
        description: 'Aktuelle Serien- und Rennfahrzeuge.',
        example: 'Ein Golf GTI von 2021 braucht nur Fahrzeugschein und Klasse.',
      },
      {
        value: 'mixed',
        icon: 'mixed',
        consequence: (resolved) =>
          `Fahrzeugpass freiwillig, nur bis Baujahr ${resolved.historicCutoffYear}`,
        title: 'Gemischt',
        description: 'Historisch und modern im selben Feld.',
        example:
          'Der Fahrzeugpass ist freiwillig und nur für Fahrzeuge bis zur Baujahrgrenze gedacht.',
      },
    ],
  },
  'vehicle-type': {
    topic: 'Fahrzeuge',
    title: 'Autos, Motorräder oder beides?',
    field: 'vehicleType',
    columns: 3,
    options: [
      {
        value: 'car',
        icon: 'car',
        consequence: 'Das Formular fragt nur nach Autos',
        title: 'Autos',
        description: 'Klassen nach Hubraum oder Fahrzeuggruppe.',
        example: 'Klasse „Serienwagen bis 1600 cm³“.',
      },
      {
        value: 'motorcycle',
        icon: 'motorcycle',
        consequence: 'Das Formular fragt nur nach Motorrädern',
        title: 'Motorräder',
        description: 'Klassen nach Hubraum, ohne Beifahrer.',
        example: 'Klasse „Motorräder 250 cm³“.',
      },
      {
        value: 'both',
        icon: 'both',
        consequence: 'Die Fahrzeugart wird beim Nennen abgefragt',
        title: 'Autos und Motorräder',
        description: 'Beide Gruppen im selben Formular.',
        example: 'Die Fahrzeugart wird beim Nennen abgefragt.',
      },
    ],
  },
  numbers: {
    topic: 'Startnummern',
    title: 'Wie kommen Fahrer zu ihrer Startnummer?',
    field: 'numberMode',
    columns: 3,
    options: [
      {
        value: 'requested',
        icon: 'requested',
        consequence: 'Wunschnummer im Formular, die Freigabe bleibt bei euch',
        title: 'Fahrer wünschen sich eine',
        description:
          'Die Wunschnummer wird beim Nennen angegeben und von euch freigegeben.',
        example:
          'Tom wünscht sich die 42. Ist sie frei, bekommt er sie; sonst schlagen wir die nächste freie vor.',
      },
      {
        value: 'assigned',
        icon: 'assigned',
        consequence: (resolved) =>
          `Kein Wunschfeld, ihr vergebt die Nummern ${rangeOf(resolved)}`,
        title: 'Ihr vergebt',
        description: 'Ihr verteilt die Nummern selbst, etwa nach Klasse.',
        example:
          'Klasse A bekommt 1–30, Klasse B 31–60. Die Fahrer sehen ihre Nummer in der Bestätigung.',
      },
      {
        value: 'automatic',
        icon: 'automatic',
        consequence: (resolved) =>
          `Kein Wunschfeld, NENNBOX zählt hoch, Nummern ${rangeOf(resolved)}`,
        title: 'Automatisch',
        description: 'NENNBOX zählt beim Eingang der Nennung hoch.',
        example: 'Erste Nennung 101, zweite Nennung 102, und so weiter.',
      },
    ],
  },
  codriver: {
    topic: 'Team',
    title: 'Fährt ein Beifahrer mit?',
    lead: 'Dann erfasst das Formular Beifahrer mit eigenen Daten und Unterschrift.',
    field: 'coDriver',
    boolean: true,
    columns: 2,
    options: [
      {
        value: 'yes',
        icon: 'codriver',
        consequence: 'Beifahrer mit eigenen Daten im Formular',
        title: 'Ja, mit Beifahrer',
        description: 'Der Beifahrer wird beim Nennen mit erfasst.',
        example: 'Rallye: Fahrer Tom Probe, Beifahrerin Lena Muster.',
      },
      {
        value: 'no',
        icon: 'solo',
        consequence: 'Das Formular fragt nur den Fahrer ab',
        title: 'Nein, nur Fahrer',
        description: 'Das Formular fragt nur den Fahrer ab.',
        example: 'Slalom und Bergrennen: ein Fahrer, ein Fahrzeug.',
      },
    ],
  },
  'double-start': {
    topic: 'Starts',
    title: 'Darf ein Fahrer mehrfach starten?',
    lead: 'Doppelstarter fahren zum Beispiel zwei Fahrzeuge oder zwei Klassen.',
    field: 'doubleStart',
    boolean: true,
    columns: 2,
    options: [
      {
        value: 'yes',
        icon: 'double-start',
        consequence: 'Mehrere Startmeldungen pro Fahrer möglich',
        title: 'Ja, Doppelstarter erlaubt',
        description: 'Ein Fahrer kann mehrere Startmeldungen anlegen.',
        example:
          'Anna startet mit dem BMW in Klasse H2 und mit dem Mini in Klasse H1.',
      },
      {
        value: 'no',
        icon: 'single-start',
        consequence: 'Genau eine Startmeldung pro Fahrer',
        title: 'Nein, ein Start pro Fahrer',
        description: 'Das Formular erlaubt nur eine Startmeldung.',
        example: 'Jede Person erscheint nur einmal in der Startliste.',
      },
    ],
  },
  payment: {
    topic: 'Bezahlung',
    title: 'Wie bezahlen eure Teilnehmer?',
    field: 'paymentMode',
    columns: 3,
    options: [
      {
        value: 'online',
        icon: 'online',
        consequence:
          'Zahlung bei der Nennung, Eingang wird automatisch zugeordnet',
        title: 'Online',
        description: 'Karte, Apple Pay oder SEPA direkt bei der Nennung.',
        example:
          'Zahlungseingang wird automatisch zugeordnet, eure Nennung ist sofort bezahlt.',
      },
      {
        value: 'transfer',
        icon: 'transfer',
        consequence: 'Bankdaten und Verwendungszweck, ihr ordnet Eingänge zu',
        title: 'Überweisung',
        description: 'Teilnehmer überweisen, ihr ordnet den Eingang zu.',
        example:
          'Der Teilnehmer erhält Verwendungszweck und Bankdaten, ihr hakt den Eingang ab.',
      },
      {
        value: 'both',
        icon: 'online-and-transfer',
        consequence:
          'Teilnehmer wählen selbst, ihr ordnet nur Überweisungen zu',
        title: 'Beides',
        description: 'Teilnehmer wählen selbst.',
        example: 'Wer schnell sein will, zahlt online. Wer nicht, überweist.',
      },
    ],
  },
} satisfies Record<string, ChoiceStep>;
