import { and, eq, gt, gte, sql } from 'drizzle-orm';
import {
  participantMemoryConsentTerms,
  participantMemoryDriverFields,
  participantMemoryPassengerFields,
  participantMemoryVehicleFields,
  type ParticipantMemoryBounds,
  type ParticipantMemoryFieldPreview,
  type ParticipantMemoryIdentity,
  type ParticipantMemoryOffer,
  type ParticipantMemoryTakeInput,
  type ParticipantMemoryTaken,
  type ParticipantMemoryView,
  type RequestContext,
} from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { events } from './schema/organization.js';
import { eventEntryDocumentTypes } from './schema/documents.js';
import {
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryVehicles,
} from './participant-memory-schema.js';
import { adoptMemoryDocument } from './participant-memory-adopt.js';
import {
  activeConsent,
  lockParticipant,
  memoryEnabled,
  memoryOwner,
  retentionCutoff,
} from './participant-memory-support.js';

type Scalar = string | number | null;
/** Identifiers that are masked in previews; the participant sees them in full only after taking them. */
const masked = new Set(['licenseNumber', 'vin']);
const preview = (
  rows: Record<string, unknown>,
  keys: readonly string[],
  rename: Record<string, string> = {},
): ParticipantMemoryFieldPreview[] =>
  keys.flatMap((key) => {
    const value = rows[rename[key] ?? key];
    if (value === null || value === undefined || value === '') return [];
    const text = String(value);
    return [
      {
        key,
        preview:
          masked.has(key) && text.length > 4 ? `••••${text.slice(-4)}` : text,
      },
    ];
  });
const values = (
  row: Record<string, unknown>,
  keys: readonly string[],
  rename: Record<string, string> = {},
) =>
  Object.fromEntries(
    keys.map((key) => [key, (row[rename[key] ?? key] ?? null) as Scalar]),
  );
const passengerRename = { email: 'passengerEmail' };

/** Reads and hands out remembered data. Every statement carries the organization id and the verified e-mail. */
export function createParticipantMemoryView(
  db: Database,
  bounds: ParticipantMemoryBounds,
) {
  /**
   * Shared gate: feature on, consent active under the current wording, an event that
   * is open for registration in this organization, an address that identifies one
   * person, unexpired data only.
   */
  const gate = async (
    tx: TransactionDatabase,
    identity: ParticipantMemoryIdentity,
    eventSlug: string,
  ) => {
    const org = identity.organizationId;
    if (!(await memoryEnabled(tx, org))) return null;
    const [event] = await tx
      .select({ id: events.id, endsOn: events.endsOn })
      .from(events)
      .where(
        and(
          eq(events.organizationId, org),
          eq(events.slug, eventSlug),
          eq(events.status, 'open'),
        ),
      );
    if (!event) return null;
    const consent = await activeConsent(tx, org, identity.email);
    // Ownership may have changed since the copy was made (someone else was named under this address).
    const owner = consent ? await memoryOwner(tx, org, identity.email) : null;
    const cutoff = await retentionCutoff(tx, org, bounds);
    return { org, event, consent, owner, cutoff };
  };
  const ownedBy = (
    table:
      | typeof participantMemoryProfiles
      | typeof participantMemoryVehicles
      | typeof participantMemoryPassengers
      | typeof participantMemoryDocuments,
    identity: ParticipantMemoryIdentity,
    cutoff: Date,
  ) =>
    and(
      eq(table.organizationId, identity.organizationId),
      eq(table.email, identity.email),
      gt(table.capturedAt, cutoff),
    );
  const documentsFor = (
    tx: TransactionDatabase,
    identity: ParticipantMemoryIdentity,
    state: { event: { id: string; endsOn: string }; cutoff: Date },
  ) =>
    tx
      .select({
        id: participantMemoryDocuments.id,
        typeKey: participantMemoryDocuments.typeKey,
        typeName: eventEntryDocumentTypes.name,
        objectId: participantMemoryDocuments.objectId,
        fileName: participantMemoryDocuments.fileName,
        contentType: participantMemoryDocuments.contentType,
        size: participantMemoryDocuments.size,
        sha256: participantMemoryDocuments.sha256,
        validUntil: participantMemoryDocuments.validUntil,
      })
      .from(participantMemoryDocuments)
      .innerJoin(
        eventEntryDocumentTypes,
        and(
          eq(
            eventEntryDocumentTypes.organizationId,
            participantMemoryDocuments.organizationId,
          ),
          eq(eventEntryDocumentTypes.eventId, state.event.id),
          eq(eventEntryDocumentTypes.key, participantMemoryDocuments.typeKey),
          eq(eventEntryDocumentTypes.enabled, true),
        ),
      )
      .where(
        and(
          ownedBy(participantMemoryDocuments, identity, state.cutoff),
          // Valid on the event day: an expired document is never offered.
          gte(participantMemoryDocuments.validUntil, state.event.endsOn),
          // Still backed by its source: a rejected document or a deleted entry takes the copy off the offer.
          sql`exists (select 1 from entry_document ed join entry e on e.organization_id = ed.organization_id and e.id = ed.entry_id where ed.organization_id = ${participantMemoryDocuments.organizationId} and ed.object_id = ${participantMemoryDocuments.objectId} and ed.type_key = ${participantMemoryDocuments.typeKey} and ed.status = 'reviewed' and e.verification_status = 'verified' and e.deleted_at is null)`,
        ),
      );
  return {
    async view(
      _ctx: RequestContext,
      identity: ParticipantMemoryIdentity,
      eventSlug: string,
    ): Promise<ParticipantMemoryView | null> {
      return db.transaction(async (tx) => {
        const state = await gate(tx, identity, eventSlug);
        if (!state) return null;
        const consent = {
          granted: Boolean(state.consent),
          grantedAt: state.consent?.grantedAt.toISOString() ?? null,
          wordingVersion: participantMemoryConsentTerms.version,
        };
        if (!state.consent || !state.owner) return { consent, offer: null };
        const [profile] = await tx
          .select()
          .from(participantMemoryProfiles)
          .where(ownedBy(participantMemoryProfiles, identity, state.cutoff));
        if (!profile) return { consent, offer: null };
        const vehicles = await tx
          .select()
          .from(participantMemoryVehicles)
          .where(ownedBy(participantMemoryVehicles, identity, state.cutoff))
          .orderBy(sql`${participantMemoryVehicles.capturedAt} desc`);
        const [passenger] = await tx
          .select()
          .from(participantMemoryPassengers)
          .where(ownedBy(participantMemoryPassengers, identity, state.cutoff));
        const documents = await documentsFor(tx, identity, state);
        const offer: ParticipantMemoryOffer = {
          source: {
            eventName: profile.sourceEventName,
            eventStartsOn: String(profile.sourceEventStartsOn),
            capturedAt: profile.capturedAt.toISOString(),
          },
          driver: preview(profile, participantMemoryDriverFields),
          vehicles: vehicles.map((vehicle) => ({
            id: vehicle.id,
            label: [vehicle.make, vehicle.model, vehicle.year]
              .filter(Boolean)
              .join(' '),
            fields: preview(vehicle, participantMemoryVehicleFields),
          })),
          passenger: passenger
            ? preview(
                passenger,
                participantMemoryPassengerFields,
                passengerRename,
              )
            : [],
          documents: documents.map((document) => ({
            id: document.id,
            typeKey: document.typeKey,
            typeName: document.typeName,
            fileName: document.fileName,
            validUntil: String(document.validUntil),
          })),
        };
        return { consent, offer };
      });
    },
    async take(
      _ctx: RequestContext,
      identity: ParticipantMemoryIdentity,
      input: ParticipantMemoryTakeInput,
    ): Promise<ParticipantMemoryTaken | null> {
      return db.transaction(async (tx) => {
        await lockParticipant(tx, identity.organizationId, identity.email);
        const state = await gate(tx, identity, input.eventSlug);
        if (!state?.consent || !state.owner) return null;
        const taken: ParticipantMemoryTaken = {
          driver: {},
          vehicles: [],
          passenger: {},
          documents: [],
        };
        const driverKeys = (input.driver ?? []).filter((key) =>
          participantMemoryDriverFields.includes(key),
        );
        if (driverKeys.length) {
          const [profile] = await tx
            .select()
            .from(participantMemoryProfiles)
            .where(ownedBy(participantMemoryProfiles, identity, state.cutoff));
          if (!profile) return null;
          taken.driver = values(profile, driverKeys);
        }
        for (const wanted of input.vehicles ?? []) {
          const [vehicle] = await tx
            .select()
            .from(participantMemoryVehicles)
            .where(
              and(
                ownedBy(participantMemoryVehicles, identity, state.cutoff),
                eq(participantMemoryVehicles.id, wanted.id),
              ),
            );
          if (!vehicle) return null;
          taken.vehicles.push({
            id: vehicle.id,
            values: values(
              vehicle,
              wanted.fields.filter((key) =>
                participantMemoryVehicleFields.includes(key),
              ),
            ),
          });
        }
        const passengerKeys = (input.passenger ?? []).filter((key) =>
          participantMemoryPassengerFields.includes(key),
        );
        if (passengerKeys.length) {
          const [passenger] = await tx
            .select()
            .from(participantMemoryPassengers)
            .where(
              ownedBy(participantMemoryPassengers, identity, state.cutoff),
            );
          if (!passenger) return null;
          taken.passenger = values(passenger, passengerKeys, passengerRename);
        }
        if (input.documents?.length) {
          const offered = await documentsFor(tx, identity, state);
          for (const wanted of input.documents) {
            const adopted = await adoptMemoryDocument(
              tx,
              identity,
              state,
              wanted,
              offered.find((row) => row.id === wanted.id),
            );
            if (!adopted) return null;
            taken.documents.push(adopted);
          }
        }
        return taken;
      });
    },
  };
}
