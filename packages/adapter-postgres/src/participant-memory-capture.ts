import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { normalizeTeamEmail } from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import { events } from './schema/organization.js';
import {
  entries,
  people,
  registrationGroups,
  vehicles,
} from './schema/entries.js';
import { entryPassengers } from './schema/passengers.js';
import { entryDocuments, eventEntryDocumentTypes } from './schema/documents.js';
import {
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryVehicles,
} from './participant-memory-schema.js';
import {
  activeConsent,
  lockParticipant,
  memoryEnabled,
} from './participant-memory-support.js';

const norm = (value: string | null) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, '');
/** One vehicle, however often it was entered: VIN, else registration, else make/model/year. */
export function vehicleFingerprint(v: {
  vin: string | null;
  registration: string | null;
  make: string;
  model: string;
  year: number | null;
}) {
  if (norm(v.vin)) return `vin:${norm(v.vin)}`;
  if (norm(v.registration)) return `reg:${norm(v.registration)}`;
  return `mm:${norm(v.make)}|${norm(v.model)}|${v.year ?? ''}`;
}

/**
 * Copies what a participant entered in verified entries of this organization
 * into the memory. Source rows are selected by the verified contact e-mail of
 * the registration group and the organization id, nothing else.
 * Callers hold the participant lock. Returns false without consent.
 */
export async function captureParticipantMemory(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
): Promise<boolean> {
  if (!(await memoryEnabled(tx, organizationId))) return false;
  if (!(await activeConsent(tx, organizationId, email))) return false;
  const now = new Date();
  const groups = await tx
    .select({
      id: registrationGroups.id,
      personId: registrationGroups.personId,
      phone: registrationGroups.phone,
      street: registrationGroups.street,
      postalCode: registrationGroups.postalCode,
      city: registrationGroups.city,
      bloodGroup: registrationGroups.bloodGroup,
      licenseNumber: registrationGroups.licenseNumber,
      licenseValidUntil: registrationGroups.licenseValidUntil,
      emergencyContactName: registrationGroups.emergencyContactName,
      emergencyContactPhone: registrationGroups.emergencyContactPhone,
      firstName: people.firstName,
      lastName: people.lastName,
      dateOfBirth: people.dateOfBirth,
      country: people.country,
      eventName: events.name,
      eventStartsOn: events.startsOn,
    })
    .from(registrationGroups)
    .innerJoin(
      people,
      and(
        eq(people.organizationId, registrationGroups.organizationId),
        eq(people.id, registrationGroups.personId),
        sql`${people.deletedAt} is null`,
      ),
    )
    .innerJoin(
      events,
      and(
        eq(events.organizationId, registrationGroups.organizationId),
        eq(events.id, registrationGroups.eventId),
      ),
    )
    .where(
      and(
        eq(registrationGroups.organizationId, organizationId),
        sql`lower(trim(${registrationGroups.contactEmail})) = ${email}`,
        sql`exists (select 1 from entry e where e.organization_id = ${registrationGroups.organizationId} and e.registration_group_id = ${registrationGroups.id} and e.verification_status = 'verified' and e.deleted_at is null)`,
      ),
    )
    .orderBy(desc(registrationGroups.createdAt));
  const latest = groups[0];
  if (!latest) return true;
  const stamp = { capturedAt: now };
  const { id: _group, personId: _person, ...fields } = latest;
  const profile = {
    ...fields,
    sourceEventName: latest.eventName,
    sourceEventStartsOn: String(latest.eventStartsOn),
  } as Record<string, unknown>;
  delete profile.eventName;
  delete profile.eventStartsOn;
  await tx
    .insert(participantMemoryProfiles)
    .values({ organizationId, email, ...profile, ...stamp } as never)
    .onConflictDoUpdate({
      target: [
        participantMemoryProfiles.organizationId,
        participantMemoryProfiles.email,
      ],
      set: { ...profile, ...stamp } as never,
    });
  const groupIds = groups.map((group) => group.id);
  const verified = and(
    eq(entries.organizationId, organizationId),
    inArray(entries.registrationGroupId, groupIds),
    eq(entries.verificationStatus, 'verified'),
    sql`${entries.deletedAt} is null`,
  );
  const sourceVehicles = await tx
    .select({
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      registration: vehicles.registration,
      vin: vehicles.vin,
      vehicleType: vehicles.vehicleType,
      displacementCc: vehicles.displacementCc,
      cylinders: vehicles.cylinders,
      transponderNumber: vehicles.transponderNumber,
      vehiclePassNumber: vehicles.vehiclePassNumber,
      ownerName: vehicles.ownerName,
    })
    .from(entries)
    .innerJoin(
      vehicles,
      and(
        eq(vehicles.organizationId, entries.organizationId),
        eq(vehicles.id, entries.vehicleId),
        sql`${vehicles.deletedAt} is null`,
      ),
    )
    .where(verified)
    .orderBy(desc(entries.createdAt));
  const seen = new Set<string>();
  for (const vehicle of sourceVehicles) {
    const fingerprint = vehicleFingerprint(vehicle);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    await tx
      .insert(participantMemoryVehicles)
      .values({ organizationId, email, fingerprint, ...vehicle, ...stamp })
      .onConflictDoUpdate({
        target: [
          participantMemoryVehicles.organizationId,
          participantMemoryVehicles.email,
          participantMemoryVehicles.fingerprint,
        ],
        set: { ...vehicle, ...stamp },
      });
  }
  const [passenger] = await tx
    .select({
      firstName: entryPassengers.firstName,
      lastName: entryPassengers.lastName,
      passengerEmail: entryPassengers.email,
      dateOfBirth: entryPassengers.dateOfBirth,
      country: entryPassengers.country,
      phone: entryPassengers.phone,
    })
    .from(entryPassengers)
    .innerJoin(
      entries,
      and(
        eq(entries.organizationId, entryPassengers.organizationId),
        eq(entries.id, entryPassengers.entryId),
      ),
    )
    .where(and(verified, sql`${entryPassengers.completedAt} is not null`))
    .orderBy(desc(entryPassengers.completedAt))
    .limit(1);
  if (passenger)
    await tx
      .insert(participantMemoryPassengers)
      .values({ organizationId, email, ...passenger, ...stamp })
      .onConflictDoUpdate({
        target: [
          participantMemoryPassengers.organizationId,
          participantMemoryPassengers.email,
        ],
        set: { ...passenger, ...stamp },
      });
  // Only documents an organizer reviewed and that carry an expiry date are worth keeping.
  const documents = await tx
    .select({
      typeKey: entryDocuments.typeKey,
      typeName: eventEntryDocumentTypes.name,
      objectId: entryDocuments.objectId,
      validUntil: entryDocuments.validUntil,
      fileName: entryDocuments.fileName,
      contentType: entryDocuments.contentType,
      size: entryDocuments.size,
      sha256: entryDocuments.sha256,
    })
    .from(entryDocuments)
    .innerJoin(
      entries,
      and(
        eq(entries.organizationId, entryDocuments.organizationId),
        eq(entries.id, entryDocuments.entryId),
      ),
    )
    .innerJoin(
      eventEntryDocumentTypes,
      and(
        eq(
          eventEntryDocumentTypes.organizationId,
          entryDocuments.organizationId,
        ),
        eq(eventEntryDocumentTypes.eventId, entryDocuments.eventId),
        eq(eventEntryDocumentTypes.key, entryDocuments.typeKey),
      ),
    )
    .where(
      and(
        verified,
        eq(entryDocuments.status, 'reviewed'),
        sql`${entryDocuments.validUntil} is not null`,
      ),
    );
  for (const document of documents)
    await tx
      .insert(participantMemoryDocuments)
      .values({
        organizationId,
        email,
        ...document,
        validUntil: String(document.validUntil),
        ...stamp,
      })
      .onConflictDoUpdate({
        target: [
          participantMemoryDocuments.organizationId,
          participantMemoryDocuments.email,
          participantMemoryDocuments.typeKey,
          participantMemoryDocuments.objectId,
        ],
        set: { validUntil: String(document.validUntil), ...stamp },
      });
  return true;
}

/** Hook for verification: keep an already consenting participant's memory current. Never throws into the caller. */
export async function refreshParticipantMemoryForGroup(
  tx: TransactionDatabase,
  organizationId: string,
  registrationGroupId: string,
): Promise<void> {
  try {
    await tx.transaction(async (savepoint) => {
      if (!(await memoryEnabled(savepoint, organizationId))) return;
      const [group] = await savepoint
        .select({ email: registrationGroups.contactEmail })
        .from(registrationGroups)
        .where(
          and(
            eq(registrationGroups.organizationId, organizationId),
            eq(registrationGroups.id, registrationGroupId),
          ),
        );
      if (!group?.email) return;
      const email = normalizeTeamEmail(group.email);
      await lockParticipant(savepoint, organizationId, email);
      await captureParticipantMemory(savepoint, organizationId, email);
    });
  } catch {
    // Memory is a convenience; it must never break an email verification.
  }
}
