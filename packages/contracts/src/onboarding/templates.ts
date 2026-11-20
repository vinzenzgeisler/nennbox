import type {
  EventKind,
  NumberMode,
  PaymentMode,
  StarterGroup,
  VehicleEra,
  VehicleType,
} from './types.js';

export interface TemplateClass {
  name: string;
  feeCents: number;
}

/** The starting point an event type provides; everything stays editable afterwards. */
export interface EventTemplate {
  kind: EventKind;
  /** Name part of the proposed title, e.g. "Bergrennen" in "Bergrennen 2027". */
  titleName: string;
  days: 1 | 2;
  classes: TemplateClass[];
  startNumberRange: { from: number; to: number };
  defaults: {
    starters: StarterGroup;
    vehicleEra: VehicleEra;
    vehicleType: VehicleType;
    expectedStarters: number;
    numberMode: NumberMode;
    coDriver: boolean;
    doubleStart: boolean;
    paymentMode: PaymentMode;
  };
  /** Classes are defined by engine size, so the form asks for it. */
  displacementClasses: boolean;
  timing: boolean;
  terms: string;
}

const termsIntro =
  'Mit der Nennung erkennt der Teilnehmer die Ausschreibung und diese Teilnahmebedingungen an. ';
const liability =
  'Die Teilnahme erfolgt auf eigene Gefahr. Der Veranstalter haftet nur bei Vorsatz und grober Fahrlässigkeit; die Haftung für leichte Fahrlässigkeit ist ausgeschlossen, soweit gesetzlich zulässig. Der Fahrer versichert, dass Fahrer und Fahrzeug den Anforderungen der Ausschreibung entsprechen.';
const withdrawal =
  'Bei Rücktritt bis zum Nennungsschluss wird das Startgeld abzüglich einer Bearbeitungsgebühr erstattet; danach nur, wenn ein Ersatzstarter gefunden wird.';

export const eventTemplates: Record<EventKind, EventTemplate> = {
  hillclimb: {
    kind: 'hillclimb',
    titleName: 'Bergrennen',
    days: 2,
    classes: [
      { name: 'Serienwagen bis 1600 cm³', feeCents: 9000 },
      { name: 'Serienwagen über 1600 cm³', feeCents: 11000 },
      { name: 'Rennwagen', feeCents: 13000 },
      { name: 'Motorräder', feeCents: 8000 },
    ],
    startNumberRange: { from: 1, to: 199 },
    defaults: {
      starters: 'licensed',
      vehicleEra: 'mixed',
      vehicleType: 'both',
      expectedStarters: 120,
      numberMode: 'requested',
      coDriver: false,
      doubleStart: true,
      paymentMode: 'both',
    },
    displacementClasses: true,
    timing: true,
    terms: `${termsIntro}Die Strecke ist während der Veranstaltung gesperrt; der Fahrer folgt den Anweisungen der Streckenposten. ${liability} ${withdrawal}`,
  },
  rally: {
    kind: 'rally',
    titleName: 'Rallye',
    days: 1,
    classes: [
      { name: 'Klasse 1 – bis 1600 cm³', feeCents: 22000 },
      { name: 'Klasse 2 – über 1600 cm³', feeCents: 26000 },
      { name: 'Historisch', feeCents: 20000 },
    ],
    startNumberRange: { from: 1, to: 99 },
    defaults: {
      starters: 'licensed',
      vehicleEra: 'modern',
      vehicleType: 'car',
      expectedStarters: 60,
      numberMode: 'assigned',
      coDriver: true,
      doubleStart: false,
      paymentMode: 'online',
    },
    displacementClasses: true,
    timing: false,
    terms: `${termsIntro}Fahrer und Beifahrer beachten die Straßenverkehrsordnung auf allen Verbindungsetappen. ${liability} ${withdrawal}`,
  },
  slalom: {
    kind: 'slalom',
    titleName: 'Slalom',
    days: 1,
    classes: [
      { name: 'Klasse A – bis 1400 cm³', feeCents: 4500 },
      { name: 'Klasse B – bis 2000 cm³', feeCents: 4500 },
      { name: 'Klasse C – über 2000 cm³', feeCents: 4500 },
      { name: 'Einsteiger', feeCents: 3500 },
    ],
    startNumberRange: { from: 1, to: 150 },
    defaults: {
      starters: 'guests',
      vehicleEra: 'mixed',
      vehicleType: 'car',
      expectedStarters: 80,
      numberMode: 'automatic',
      coDriver: false,
      doubleStart: true,
      paymentMode: 'transfer',
    },
    displacementClasses: true,
    timing: true,
    terms: `${termsIntro}Das Fahren auf dem Gelände erfolgt nur mit Helm und angelegten Gurten. ${liability} ${withdrawal}`,
  },
  regularity: {
    kind: 'regularity',
    titleName: 'Gleichmäßigkeitsfahrt',
    days: 1,
    classes: [
      { name: 'Vorkriegsfahrzeuge (bis 1945)', feeCents: 12000 },
      { name: 'Klassiker 1946–1969', feeCents: 12000 },
      { name: 'Youngtimer 1970–1990', feeCents: 12000 },
    ],
    startNumberRange: { from: 1, to: 120 },
    defaults: {
      starters: 'guests',
      vehicleEra: 'historic',
      vehicleType: 'car',
      expectedStarters: 50,
      numberMode: 'assigned',
      coDriver: true,
      doubleStart: false,
      paymentMode: 'both',
    },
    displacementClasses: false,
    timing: false,
    terms: `${termsIntro}Es gilt die Straßenverkehrsordnung; Wertungsprüfungen sind keine Rennen. ${liability} ${withdrawal}`,
  },
  kart: {
    kind: 'kart',
    titleName: 'Kartrennen',
    days: 1,
    classes: [
      { name: 'Bambini (bis 12 Jahre)', feeCents: 6000 },
      { name: 'Junioren', feeCents: 8000 },
      { name: 'Senioren', feeCents: 8000 },
      { name: 'Schaltkart', feeCents: 9500 },
    ],
    startNumberRange: { from: 1, to: 99 },
    defaults: {
      starters: 'clubsport',
      vehicleEra: 'modern',
      vehicleType: 'car',
      expectedStarters: 60,
      numberMode: 'assigned',
      coDriver: false,
      doubleStart: false,
      paymentMode: 'online',
    },
    displacementClasses: false,
    timing: true,
    terms: `${termsIntro}Minderjährige starten nur mit schriftlicher Einwilligung der Erziehungsberechtigten. ${liability} ${withdrawal}`,
  },
  circuit: {
    kind: 'circuit',
    titleName: 'Trackday',
    days: 1,
    classes: [
      { name: 'Gruppe Einsteiger', feeCents: 16000 },
      { name: 'Gruppe Fortgeschrittene', feeCents: 18000 },
      { name: 'Gruppe Profis', feeCents: 20000 },
    ],
    startNumberRange: { from: 1, to: 199 },
    defaults: {
      starters: 'guests',
      vehicleEra: 'mixed',
      vehicleType: 'both',
      expectedStarters: 90,
      numberMode: 'automatic',
      coDriver: false,
      doubleStart: false,
      paymentMode: 'online',
    },
    displacementClasses: false,
    timing: true,
    terms: `${termsIntro}Die Teilnahme setzt die Fahrerbesprechung am Veranstaltungsmorgen voraus. Geräuschlimits der Strecke sind einzuhalten. ${liability} ${withdrawal}`,
  },
  other: {
    kind: 'other',
    titleName: 'Veranstaltung',
    days: 1,
    classes: [
      { name: 'Klasse 1', feeCents: 5000 },
      { name: 'Klasse 2', feeCents: 5000 },
    ],
    startNumberRange: { from: 1, to: 99 },
    defaults: {
      starters: 'guests',
      vehicleEra: 'mixed',
      vehicleType: 'both',
      expectedStarters: 50,
      numberMode: 'automatic',
      coDriver: false,
      doubleStart: false,
      paymentMode: 'transfer',
    },
    displacementClasses: false,
    timing: false,
    terms: `${termsIntro}${liability} ${withdrawal}`,
  },
};

export const eventTemplate = (kind: EventKind): EventTemplate =>
  eventTemplates[kind];
