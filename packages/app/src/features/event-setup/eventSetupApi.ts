import { adminFetch } from '../../auth.js';
import { z } from 'zod';

export type SetupEvent = {
  id: string;
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  organizerName?: string | null | undefined;
  organizerAddress?: string | null | undefined;
  arrivalNotes?: string | null | undefined;
  paddockNotes?: string | null | undefined;

  status: 'draft' | 'open' | 'closed' | 'archived';
};
export type SetupClass = {
  id: string;
  name: string;
  code: string;
  vehicleType: VehicleType;
  sortOrder: number;
  maxParticipants: number | null;
  closed: boolean;
  passengerMode: PassengerMode;
};
export type PassengerMode = 'none' | 'optional' | 'required';
export type VehicleType = 'car' | 'motorcycle' | 'kart' | 'other';
export type SetupPriceRule = {
  classId: string;
  baseCents: number;
  additionalEntryAdjustmentCents: number;
  earlyBirdDeadline: string | null;
  earlyBirdDiscountCents: number;
};
export type SetupConsent = {
  key: string;
  version: string;
  language: 'de' | 'en';
  text: string;
  hash: string;
  required: boolean;
};
export type SetupClassDraft = {
  id?: string;
  name: string;
  code: string;
  fee: string;
  vehicleType: VehicleType;
  maxParticipants?: number | null;
  closed?: boolean;
  passengerMode?: PassengerMode;
  additionalEntryAdjustmentCents?: number;
  earlyBirdDeadline?: string | null;
  earlyBirdDiscountCents?: number;
};
export type SetupDraft = {
  id?: string;
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  classes: SetupClassDraft[];
  terms: string;
  organizerName: string;
  organizerAddress: string;
  arrivalNotes: string;
  paddockNotes: string;
  accountName: string;
  recipientAddress: string;
  iban: string;
  bic: string;
  consentTerms?: SetupConsent[];
  recipientRemoval?: boolean;
};
export type EventOption = Pick<SetupEvent, 'id' | 'name' | 'slug' | 'status'>;
const SetupEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  status: z.enum(['draft', 'open', 'closed', 'archived']),
  organizerName: z.string().nullable().optional(),
  organizerAddress: z.string().nullable().optional(),
  arrivalNotes: z.string().nullable().optional(),
  paddockNotes: z.string().nullable().optional(),
});
const EventOptionSchema = SetupEventSchema.pick({
  id: true,
  name: true,
  slug: true,
  status: true,
});
const SetupClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  vehicleType: z.enum(['car', 'motorcycle', 'kart', 'other']),
  sortOrder: z.number(),
  maxParticipants: z.number().nullable(),
  closed: z.boolean(),
  passengerMode: z.enum(['none', 'optional', 'required']).default('optional'),
});
const SetupPriceSchema = z.object({
  classId: z.string(),
  baseCents: z.number(),
  additionalEntryAdjustmentCents: z.number(),
  earlyBirdDeadline: z.string().nullable(),
  earlyBirdDiscountCents: z.number(),
});

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await adminFetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : undefined;
    throw new HttpError(
      message ?? `Speichern fehlgeschlagen (${response.status}).`,
      response.status,
    );
  }
  return schema.parse(await response.json());
}

export const listEvents = () =>
  request('/admin/events', z.array(EventOptionSchema));
export const loadEvent = (id: string, signal?: AbortSignal) =>
  request<SetupEvent>(
    `/admin/events/${encodeURIComponent(id)}`,
    SetupEventSchema,
    signal ? { signal } : undefined,
  );
export const saveEvent = (draft: SetupDraft) =>
  draft.id
    ? request(
        `/admin/events/${encodeURIComponent(draft.id)}`,
        SetupEventSchema,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: draft.name.trim(),
            slug: draft.slug.trim(),
            startsOn: draft.startsOn,
            endsOn: draft.endsOn,
            organizerName: draft.organizerName.trim() || null,
            organizerAddress: draft.organizerAddress.trim() || null,
            arrivalNotes: draft.arrivalNotes.trim() || null,
            paddockNotes: draft.paddockNotes.trim() || null,
          }),
        },
      )
    : request('/admin/events', SetupEventSchema, {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          slug: draft.slug.trim(),
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
          organizerName: draft.organizerName.trim() || null,
          organizerAddress: draft.organizerAddress.trim() || null,
          arrivalNotes: draft.arrivalNotes.trim() || null,
          paddockNotes: draft.paddockNotes.trim() || null,
        }),
      });
export const listClasses = (eventId: string, signal?: AbortSignal) =>
  request<SetupClass[]>(
    `/admin/events/${encodeURIComponent(eventId)}/classes`,
    z.array(SetupClassSchema),
    signal ? { signal } : undefined,
  );
export const listPricing = (eventId: string, signal?: AbortSignal) =>
  request<SetupPriceRule[]>(
    `/admin/events/${encodeURIComponent(eventId)}/pricing`,
    z.array(SetupPriceSchema),
    signal ? { signal } : undefined,
  );
export const saveClass = (
  eventId: string,
  item: SetupClassDraft,
  sortOrder: number,
) =>
  request<SetupClass>(
    item.id
      ? `/admin/events/${encodeURIComponent(eventId)}/classes/${encodeURIComponent(item.id)}`
      : `/admin/events/${encodeURIComponent(eventId)}/classes`,
    SetupClassSchema,
    {
      method: item.id ? 'PATCH' : 'POST',
      body: JSON.stringify({
        name: item.name.trim(),
        code: item.code.trim(),
        vehicleType: item.vehicleType,
        ...(item.passengerMode && { passengerMode: item.passengerMode }),
        sortOrder,
        ...(!item.id && {
          maxParticipants: item.maxParticipants ?? null,
          closed: item.closed ?? false,
        }),
      }),
    },
  );
export const savePricing = (
  eventId: string,
  classId: string,
  rule: Omit<SetupPriceRule, 'classId'>,
) =>
  request(
    `/admin/events/${encodeURIComponent(eventId)}/pricing/${encodeURIComponent(classId)}`,
    SetupPriceSchema,
    {
      method: 'PUT',
      body: JSON.stringify({
        ...rule,
      }),
    },
  );
export { loadTerms, saveTerms } from './eventSetupTermsApi.js';
export const openEvent = (eventId: string) =>
  request(
    `/admin/events/${encodeURIComponent(eventId)}/transitions`,
    SetupEventSchema,
    {
      method: 'POST',
      body: JSON.stringify({ status: 'open' }),
    },
  );
