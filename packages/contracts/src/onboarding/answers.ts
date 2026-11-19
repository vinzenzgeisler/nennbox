import {
  addDays,
  defaultBrandPalette,
  slugifyClubName,
  suggestEntryDeadline,
  isIsoDay,
} from './helpers.js';
import { eventTemplate } from './templates.js';
import type {
  EventKind,
  NumberMode,
  OnboardingAnswers,
  OnboardingClass,
  PaymentMode,
  StarterGroup,
  StripeTiming,
  VehicleEra,
  VehicleType,
} from './types.js';

export function createOnboardingAnswers(): OnboardingAnswers {
  return {
    authMethod: null,
    clubName: '',
    subdomain: null,
    logoName: null,
    primaryColor: null,
    accentColor: null,
    kind: null,
    starters: null,
    vehicleEra: null,
    historicCutoffYear: null,
    vehicleType: null,
    expectedStarters: null,
    waitlist: null,
    numberMode: null,
    coDriver: null,
    doubleStart: null,
    paymentMode: null,
    stripeTiming: null,
    classes: null,
    eventTitle: null,
    startDate: null,
    endDate: null,
    location: '',
    entryDeadline: null,
    terms: null,
  };
}

/** Answers with every undecided question replaced by NENNBOX's suggestion. */
export interface ResolvedAnswers {
  kind: EventKind;
  clubName: string;
  subdomain: string;
  primaryColor: string;
  accentColor: string;
  starters: StarterGroup;
  vehicleEra: VehicleEra;
  historicCutoffYear: number;
  vehicleType: VehicleType;
  expectedStarters: number;
  waitlist: boolean;
  numberMode: NumberMode;
  coDriver: boolean;
  doubleStart: boolean;
  paymentMode: PaymentMode;
  stripeTiming: StripeTiming;
  classes: OnboardingClass[];
  eventTitle: string;
  startDate: string | null;
  endDate: string | null;
  location: string;
  entryDeadline: string | null;
  terms: string;
}

export const defaultHistoricCutoffYear = 1990;
export const waitlistThreshold = 30;

export function templateClasses(kind: EventKind): OnboardingClass[] {
  return eventTemplate(kind).classes.map((item, index) => ({
    id: `template-${index + 1}`,
    ...item,
  }));
}

export function suggestedTitle(
  kind: EventKind,
  startDate: string | null,
): string {
  const year = startDate ? startDate.slice(0, 4) : '';
  return `${eventTemplate(kind).titleName} ${year}`.trim();
}

export function resolveAnswers(answers: OnboardingAnswers): ResolvedAnswers {
  const kind = answers.kind ?? 'other';
  const template = eventTemplate(kind);
  const defaults = template.defaults;
  const expectedStarters =
    answers.expectedStarters ?? defaults.expectedStarters;
  const startDate = isIsoDay(answers.startDate) ? answers.startDate : null;
  const endDate = isIsoDay(answers.endDate)
    ? answers.endDate
    : startDate && template.days === 2
      ? addDays(startDate, 1)
      : startDate;
  return {
    kind,
    clubName: answers.clubName.trim(),
    subdomain: answers.subdomain ?? slugifyClubName(answers.clubName),
    primaryColor: answers.primaryColor ?? defaultBrandPalette.primary,
    accentColor: answers.accentColor ?? defaultBrandPalette.accent,
    starters: answers.starters ?? defaults.starters,
    vehicleEra: answers.vehicleEra ?? defaults.vehicleEra,
    historicCutoffYear: answers.historicCutoffYear ?? defaultHistoricCutoffYear,
    vehicleType: answers.vehicleType ?? defaults.vehicleType,
    expectedStarters,
    waitlist: answers.waitlist ?? expectedStarters >= waitlistThreshold,
    numberMode: answers.numberMode ?? defaults.numberMode,
    coDriver: answers.coDriver ?? defaults.coDriver,
    doubleStart: answers.doubleStart ?? defaults.doubleStart,
    paymentMode: answers.paymentMode ?? defaults.paymentMode,
    stripeTiming: answers.stripeTiming ?? 'later',
    classes: answers.classes ?? templateClasses(kind),
    eventTitle: answers.eventTitle?.trim() || suggestedTitle(kind, startDate),
    startDate,
    endDate,
    location: answers.location.trim(),
    entryDeadline: isIsoDay(answers.entryDeadline)
      ? answers.entryDeadline
      : startDate
        ? suggestEntryDeadline(startDate)
        : null,
    terms: answers.terms ?? template.terms,
  };
}
