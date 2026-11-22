/**
 * Typed answers of the guided onboarding (#201). Everything here is pure data: the
 * prototype keeps it in local state, the connected flow persists the same shape and
 * hands the derived proposal to the organization, event-setup, class, form-field,
 * start-number, waitlist and payment APIs.
 */
export const authMethods = ['google', 'passkey', 'email-code'] as const;
export type AuthMethod = (typeof authMethods)[number];

export const eventKinds = [
  'hillclimb',
  'rally',
  'slalom',
  'regularity',
  'kart',
  'circuit',
  'other',
] as const;
export type EventKind = (typeof eventKinds)[number];

export const starterGroups = ['licensed', 'clubsport', 'guests'] as const;
export type StarterGroup = (typeof starterGroups)[number];

export const vehicleEras = ['historic', 'modern', 'mixed'] as const;
export type VehicleEra = (typeof vehicleEras)[number];

export const vehicleTypes = ['car', 'motorcycle', 'both'] as const;
export type VehicleType = (typeof vehicleTypes)[number];

export const numberModes = ['requested', 'assigned', 'automatic'] as const;
export type NumberMode = (typeof numberModes)[number];

export const paymentModes = ['online', 'transfer', 'both'] as const;
export type PaymentMode = (typeof paymentModes)[number];

export type StripeTiming = 'now' | 'later';

/**
 * Languages participants can register in. German is always the main language; the
 * registration form and its mails exist in German and English today.
 */
export const eventLanguages = ['de', 'en'] as const;
export type EventLanguage = (typeof eventLanguages)[number];

export interface OnboardingClass {
  id: string;
  name: string;
  /** Entry fee in euro cents; 0 means free of charge. */
  feeCents: number;
}

/**
 * `null` always means "the member has not decided, use the suggestion", so skipping a
 * screen and confirming the recommendation lead to the same configuration.
 */
export interface OnboardingAnswers {
  authMethod: AuthMethod | null;
  clubName: string;
  /** `null` follows the name: the address is proposed from it until edited. */
  subdomain: string | null;
  logoName: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  kind: EventKind | null;
  starters: StarterGroup | null;
  vehicleEra: VehicleEra | null;
  historicCutoffYear: number | null;
  vehicleType: VehicleType | null;
  expectedStarters: number | null;
  waitlist: boolean | null;
  numberMode: NumberMode | null;
  coDriver: boolean | null;
  doubleStart: boolean | null;
  paymentMode: PaymentMode | null;
  stripeTiming: StripeTiming | null;
  /** Additional languages besides German; `null` follows the suggestion (English). */
  languages: EventLanguage[] | null;
  /** Registration form fields the member turned off; only optional fields can be turned off. */
  hiddenFields: string[];
  classes: OnboardingClass[] | null;
  eventTitle: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string;
  entryDeadline: string | null;
  terms: string | null;
}

export type OnboardingStepId =
  | 'account'
  | 'club'
  | 'brand'
  | 'kind'
  | 'starters'
  | 'vehicle-era'
  | 'vehicle-type'
  | 'languages'
  | 'expected'
  | 'numbers'
  | 'codriver'
  | 'double-start'
  | 'payment'
  | 'classes'
  | 'form'
  | 'when'
  | 'terms'
  | 'summary'
  | 'success';

/**
 * The six sections of the owner's flow plus the finished draft. Several screens can
 * belong to one section; the app names the screens inside a section.
 */
export const onboardingPhases = [
  'account',
  'club',
  'event',
  'participants',
  'entry',
  'publish',
  'draft',
] as const;
export type OnboardingPhase = (typeof onboardingPhases)[number];

export type RegistrationFieldChoice = 'required' | 'optional' | 'hidden';

export type DocumentKey =
  'license' | 'vehicle-registration' | 'vehicle-pass' | 'club-membership';

/** Why a setting was preset. The app turns a code into a sentence in the active locale. */
export type ReasonCode =
  | 'license-required'
  | 'license-optional'
  | 'license-hidden'
  | 'vehicle-pass-historic'
  | 'vehicle-pass-mixed'
  | 'displacement-classes'
  | 'start-number-wish'
  | 'start-number-assigned'
  | 'start-number-automatic'
  | 'capacity-from-expected'
  | 'waitlist-on'
  | 'waitlist-off'
  | 'co-driver-on'
  | 'co-driver-off'
  | 'double-start-on'
  | 'double-start-off'
  | 'payment-online'
  | 'payment-transfer'
  | 'payment-both'
  | 'deadline-14-days'
  | 'timing-transponder'
  | 'safety-emergency-contact'
  | 'template-classes'
  | 'template-terms'
  | 'brand-from-logo'
  | 'brand-default';

export interface ProposedSetting {
  setting: string;
  reason: ReasonCode;
}
