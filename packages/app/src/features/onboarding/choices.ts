import type { SketchName } from '@racepilot/ui';
import type { OnboardingAnswers } from '@racepilot/contracts';
import { kindStep } from './choices-kind.js';

export type ChoiceOption = {
  value: string;
  sketch: SketchName;
  title: string;
  description: string;
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
  layout?: 'tiles' | 'rows';
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
        sketch: 'google',
        title: 'Mit Google',
        description: 'Ein Klick mit deinem Google-Konto.',
        example:
          'Du wählst dein Google-Konto aus und bestätigst. NENNBOX erhält nur Name und E-Mail-Adresse.',
      },
      {
        value: 'passkey',
        sketch: 'passkey',
        title: 'Mit Passkey',
        description: 'Fingerabdruck, Gesicht oder Geräte-PIN.',
        example:
          'Auf dem Handy bestätigst du mit Face ID oder Fingerabdruck. Es gibt kein Passwort, das jemand erraten kann.',
      },
      {
        value: 'email-code',
        sketch: 'email-code',
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
        sketch: 'licensed',
        title: 'Lizenzfahrer',
        description: 'Nur Fahrer mit gültiger Rennlizenz.',
        example:
          'Lizenznummer wird Pflicht, eine Kopie der Lizenz wird als Unterlage verlangt.',
      },
      {
        value: 'clubsport',
        sketch: 'clubsport',
        title: 'Clubsport',
        description: 'Mitglieder eures und befreundeter Clubs.',
        example:
          'Die Lizenznummer ist freiwillig. Ein Clubausweis kann hochgeladen werden.',
      },
      {
        value: 'guests',
        sketch: 'guests',
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
        sketch: 'historic',
        title: 'Historisch',
        description: 'Fahrzeuge bis zu einem Baujahr, mit Fahrzeugpass.',
        example:
          'Ein Oldtimer von 1958 braucht den Fahrzeugpass. Er wird beim Nennen hochgeladen und von euch geprüft.',
      },
      {
        value: 'modern',
        sketch: 'modern',
        title: 'Modern',
        description: 'Aktuelle Serien- und Rennfahrzeuge.',
        example: 'Ein Golf GTI von 2021 braucht nur Fahrzeugschein und Klasse.',
      },
      {
        value: 'mixed',
        sketch: 'mixed',
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
        sketch: 'car',
        title: 'Autos',
        description: 'Klassen nach Hubraum oder Fahrzeuggruppe.',
        example: 'Klasse „Serienwagen bis 1600 cm³“.',
      },
      {
        value: 'motorcycle',
        sketch: 'motorcycle',
        title: 'Motorräder',
        description: 'Klassen nach Hubraum, ohne Beifahrer.',
        example: 'Klasse „Motorräder 250 cm³“.',
      },
      {
        value: 'both',
        sketch: 'both',
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
        sketch: 'requested',
        title: 'Fahrer wünschen sich eine',
        description:
          'Die Wunschnummer wird beim Nennen angegeben und von euch freigegeben.',
        example:
          'Tom wünscht sich die 42. Ist sie frei, bekommt er sie; sonst schlagen wir die nächste freie vor.',
      },
      {
        value: 'assigned',
        sketch: 'assigned',
        title: 'Ihr vergebt',
        description: 'Ihr verteilt die Nummern selbst, etwa nach Klasse.',
        example:
          'Klasse A bekommt 1–30, Klasse B 31–60. Die Fahrer sehen ihre Nummer in der Bestätigung.',
      },
      {
        value: 'automatic',
        sketch: 'automatic',
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
    layout: 'rows',
    columns: 2,
    options: [
      {
        value: 'yes',
        sketch: 'codriver',
        title: 'Ja, mit Beifahrer',
        description: 'Der Beifahrer wird beim Nennen mit erfasst.',
        example: 'Rallye: Fahrer Tom Probe, Beifahrerin Lena Muster.',
      },
      {
        value: 'no',
        sketch: 'car',
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
    layout: 'rows',
    columns: 2,
    options: [
      {
        value: 'yes',
        sketch: 'double-start',
        title: 'Ja, Doppelstarter erlaubt',
        description: 'Ein Fahrer kann mehrere Startmeldungen anlegen.',
        example:
          'Anna startet mit dem BMW in Klasse H2 und mit dem Mini in Klasse H1.',
      },
      {
        value: 'no',
        sketch: 'no',
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
        sketch: 'online',
        title: 'Online',
        description: 'Karte, Apple Pay oder SEPA direkt bei der Nennung.',
        example:
          'Zahlungseingang wird automatisch zugeordnet, eure Nennung ist sofort bezahlt.',
      },
      {
        value: 'transfer',
        sketch: 'transfer',
        title: 'Überweisung',
        description: 'Teilnehmer überweisen, ihr ordnet den Eingang zu.',
        example:
          'Der Teilnehmer erhält Verwendungszweck und Bankdaten, ihr hakt den Eingang ab.',
      },
      {
        value: 'both',
        sketch: 'online-and-transfer',
        title: 'Beides',
        description: 'Teilnehmer wählen selbst.',
        example: 'Wer schnell sein will, zahlt online. Wer nicht, überweist.',
      },
    ],
  },
} satisfies Record<string, ChoiceStep>;
