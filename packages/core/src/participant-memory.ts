import type { RequestContext } from './context.js';

/** Retention bounds in days; the organization chooses a value inside them. */
export interface ParticipantMemoryRetention {
  defaultDays: number;
  minimumDays: number;
  maximumDays: number;
}
export const defaultParticipantMemoryRetention: ParticipantMemoryRetention = {
  defaultDays: 365,
  minimumDays: 30,
  maximumDays: 1095,
};
export function assertParticipantMemoryRetention(
  value: ParticipantMemoryRetention,
): ParticipantMemoryRetention {
  const { minimumDays, defaultDays, maximumDays } = value;
  if (
    ![minimumDays, defaultDays, maximumDays].every(Number.isSafeInteger) ||
    minimumDays < 1 ||
    defaultDays < minimumDays ||
    maximumDays < defaultDays
  )
    throw new Error('Invalid participant memory retention bounds');
  return value;
}
/** Retention actually applied: the organization's choice, otherwise the default, always inside the bounds. */
export function effectiveParticipantMemoryRetentionDays(
  chosen: number | null | undefined,
  bounds: ParticipantMemoryRetention,
): number {
  const days = chosen ?? bounds.defaultDays;
  return Math.min(Math.max(days, bounds.minimumDays), bounds.maximumDays);
}

/** Versioned wording the participant consents to; a change of text needs a new version. */
export const participantMemoryConsentTerms = {
  version: '2026-11-27.2',
  text: {
    de: 'Ich willige ein, dass dieser Verein meine eigenen Fahrerdaten, die von mir genannten Fahrzeuge, Name und E-Mail meines Beifahrers als Verweis sowie gültige Unterlagen aus meinen Nennungen speichert, damit ich sie bei späteren Nennungen übernehmen kann. Daten anderer Personen werden nicht gespeichert. Ich kann die Einwilligung jederzeit widerrufen und die Daten löschen lassen; bestehende Nennungen bleiben davon unberührt.',
    en: 'I consent to this club storing my own driver details, the vehicles I named, the name and e-mail of my co-driver as a reference, and valid documents from my entries so that I can reuse them in later entries. No data of other people is stored. I can withdraw this consent and have the data deleted at any time; existing entries are not affected.',
  },
} as const;

export type ParticipantMemoryBounds = ParticipantMemoryRetention;

export const participantMemoryDriverFields = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'country',
  'phone',
  'street',
  'postalCode',
  'city',
  'bloodGroup',
  'licenseNumber',
  'licenseValidUntil',
  'emergencyContactName',
  'emergencyContactPhone',
] as const;
export const participantMemoryVehicleFields = [
  'make',
  'model',
  'year',
  'registration',
  'vin',
  'vehicleType',
  'displacementCc',
  'cylinders',
  'transponderNumber',
  'vehiclePassNumber',
  'ownerName',
] as const;
export const participantMemoryPassengerFields = [
  'firstName',
  'lastName',
  'email',
] as const;
export type ParticipantMemoryDriverField =
  (typeof participantMemoryDriverFields)[number];
export type ParticipantMemoryVehicleField =
  (typeof participantMemoryVehicleFields)[number];
export type ParticipantMemoryPassengerField =
  (typeof participantMemoryPassengerFields)[number];

export interface ParticipantMemoryFieldPreview {
  key: string;
  /** Sensitive identifiers are masked here; the full value is only returned when taken. */
  preview: string;
}
export interface ParticipantMemoryOffer {
  source: { eventName: string; eventStartsOn: string; capturedAt: string };
  driver: ParticipantMemoryFieldPreview[];
  vehicles: Array<{
    id: string;
    label: string;
    fields: ParticipantMemoryFieldPreview[];
  }>;
  passenger: ParticipantMemoryFieldPreview[];
  documents: Array<{
    id: string;
    typeKey: string;
    typeName: string;
    fileName: string;
    validUntil: string;
  }>;
}
export interface ParticipantMemoryView {
  consent: {
    granted: boolean;
    grantedAt: string | null;
    wordingVersion: string;
  };
  /** Null without consent or without anything worth offering. */
  offer: ParticipantMemoryOffer | null;
}
export interface ParticipantMemoryTakeInput {
  eventSlug: string;
  driver?: readonly ParticipantMemoryDriverField[] | undefined;
  vehicles?:
    | ReadonlyArray<{
        id: string;
        fields: readonly ParticipantMemoryVehicleField[];
      }>
    | undefined;
  passenger?: readonly ParticipantMemoryPassengerField[] | undefined;
  /** Documents are attached to an entry the verified e-mail owns. */
  documents?: ReadonlyArray<{ id: string; entryId: string }> | undefined;
}
export interface ParticipantMemoryTaken {
  driver: Record<string, string | number | null>;
  vehicles: Array<{
    id: string;
    values: Record<string, string | number | null>;
  }>;
  passenger: Record<string, string | number | null>;
  documents: Array<{ id: string; entryId: string; entryDocumentId: string }>;
}
export interface ParticipantMemorySettings {
  enabled: boolean;
  retentionDays: number | null;
  effectiveRetentionDays: number;
  bounds: ParticipantMemoryRetention;
  /** Participants with stored data in this organization. */
  storedParticipants: number;
}
/** The verified e-mail a returning participant proved control over, in one organization. */
export interface ParticipantMemoryIdentity {
  organizationId: string;
  email: string;
}
export type ParticipantMemoryAccessPurpose = 'access' | 'delete';

export interface ParticipantMemoryRepository {
  settings(ctx: RequestContext): Promise<ParticipantMemorySettings>;
  configure(
    ctx: RequestContext,
    input: {
      enabled?: boolean | undefined;
      retentionDays?: number | null | undefined;
    },
  ): Promise<ParticipantMemorySettings & { purged: number }>;
  /** Always silent: queues a link only when this organization may offer something to this e-mail. */
  requestAccess(
    ctx: RequestContext,
    email: string,
    purpose: ParticipantMemoryAccessPurpose,
    locale: 'de' | 'en',
  ): Promise<void>;
  /** Single use. Returns a session token (hash only at rest) or null. */
  redeemAccess(ctx: RequestContext, token: string): Promise<string | null>;
  /** Single use. Deletes the memory of the organization that issued the link. */
  redeemDelete(ctx: RequestContext, token: string): Promise<boolean>;
  /** Organization administrators erase the memory of one person (e.g. on an Art. 17 request); audited. */
  eraseParticipant(
    ctx: RequestContext,
    email: string,
  ): Promise<{ removed: number }>;
  session(
    ctx: RequestContext,
    token: string,
  ): Promise<ParticipantMemoryIdentity | null>;
  endSession(ctx: RequestContext, token: string): Promise<void>;
  view(
    ctx: RequestContext,
    identity: ParticipantMemoryIdentity,
    eventSlug: string,
    locale?: 'de' | 'en',
  ): Promise<ParticipantMemoryView | null>;
  take(
    ctx: RequestContext,
    identity: ParticipantMemoryIdentity,
    input: ParticipantMemoryTakeInput,
  ): Promise<ParticipantMemoryTaken | null>;
  grantConsent(
    ctx: RequestContext,
    identity: ParticipantMemoryIdentity,
    wordingVersion: string,
  ): Promise<boolean>;
  revokeConsent(
    ctx: RequestContext,
    identity: ParticipantMemoryIdentity,
  ): Promise<void>;
}
