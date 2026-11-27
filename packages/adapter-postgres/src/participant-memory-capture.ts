import { and, desc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm';
import {
  normalizeTeamEmail,
  type ParticipantMemoryRetention,
} from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import { events } from './schema/organization.js';
import {
  entries,
  people,
  registrationGroups,
  vehicles,
} from './schema/entries.js';
import { entryPassengers } from './schema/passengers.js';
import { captureDocuments } from './participant-memory-capture-documents.js';
import {
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryVehicles,
} from './participant-memory-schema.js';
import {
  activeConsent,
  lockParticipant,
  memoryEnabled,
  memoryOwner,
  participantMemoryProcessBounds,
  purgeParticipantData,
  retentionCutoff,
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
 * Makes the memory of one participant equal to what the verified entries of this
 * organization say today. The memory belongs to a person, not to a contact
 * address: only the person whose own address this is (see `memoryOwner`), only
 * entries inside the retention period, only entries that still exist. What the
 * sources no longer support is removed in the same transaction, so a deleted
 * entry or a rejected document does not linger as a copy.
 * Callers hold the participant lock. Returns false without consent.
 */
export async function captureParticipantMemory(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
  bounds: ParticipantMemoryRetention = participantMemoryProcessBounds(),
): Promise<boolean> {
  if (!(await memoryEnabled(tx, organizationId))) return false;
  if (!(await activeConsent(tx, organizationId, email))) return false;
  const owner = await memoryOwner(tx, organizationId, email);
  const cutoff = await retentionCutoff(tx, organizationId, bounds);
  const groups = owner
    ? await tx
        .select({
          id: registrationGroups.id,
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
          createdAt: registrationGroups.createdAt,
        })
        .from(registrationGroups)
        .innerJoin(
          people,
          and(
            eq(people.organizationId, registrationGroups.organizationId),
            eq(people.id, registrationGroups.personId),
            eq(people.id, owner),
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
            sql`exists (select 1 from entry e where e.organization_id = ${registrationGroups.organizationId} and e.registration_group_id = ${registrationGroups.id} and e.driver_person_id = ${owner} and e.verification_status = 'verified' and e.deleted_at is null and e.created_at > ${cutoff})`,
          ),
        )
        .orderBy(desc(registrationGroups.createdAt))
    : [];
  const latest = groups[0];
  if (!owner || !latest) {
    await purgeParticipantData(tx, organizationId, email);
    return true;
  }
  const { id, eventName, eventStartsOn, createdAt, ...fields } = latest;
  void id;
  const profile = {
    ...fields,
    sourceEventName: eventName,
    sourceEventStartsOn: String(eventStartsOn),
    capturedAt: createdAt,
  };
  await tx
    .insert(participantMemoryProfiles)
    .values({ organizationId, email, ...profile })
    .onConflictDoUpdate({
      target: [
        participantMemoryProfiles.organizationId,
        participantMemoryProfiles.email,
      ],
      set: profile,
    });
  const verified = and(
    eq(entries.organizationId, organizationId),
    inArray(
      entries.registrationGroupId,
      groups.map((group) => group.id),
    ),
    eq(entries.driverPersonId, owner),
    eq(entries.verificationStatus, 'verified'),
    sql`${entries.deletedAt} is null`,
    gt(entries.createdAt, cutoff),
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
      capturedAt: entries.createdAt,
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
    const { capturedAt, ...values } = vehicle;
    await tx
      .insert(participantMemoryVehicles)
      .values({ organizationId, email, fingerprint, ...values, capturedAt })
      .onConflictDoUpdate({
        target: [
          participantMemoryVehicles.organizationId,
          participantMemoryVehicles.email,
          participantMemoryVehicles.fingerprint,
        ],
        set: { ...values, capturedAt },
      });
  }
  await tx
    .delete(participantMemoryVehicles)
    .where(
      and(
        eq(participantMemoryVehicles.organizationId, organizationId),
        eq(participantMemoryVehicles.email, email),
        seen.size
          ? notInArray(participantMemoryVehicles.fingerprint, [...seen])
          : undefined,
      ),
    );
  // The co-driver is a third party who gave no consent: name and e-mail as a pointer, nothing else.
  const [passenger] = await tx
    .select({
      firstName: entryPassengers.firstName,
      lastName: entryPassengers.lastName,
      passengerEmail: entryPassengers.email,
      capturedAt: entryPassengers.completedAt,
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
      .values({
        organizationId,
        email,
        ...passenger,
        capturedAt: passenger.capturedAt!,
      })
      .onConflictDoUpdate({
        target: [
          participantMemoryPassengers.organizationId,
          participantMemoryPassengers.email,
        ],
        set: { ...passenger, capturedAt: passenger.capturedAt! },
      });
  else
    await tx
      .delete(participantMemoryPassengers)
      .where(
        and(
          eq(participantMemoryPassengers.organizationId, organizationId),
          eq(participantMemoryPassengers.email, email),
        ),
      );
  await captureDocuments(tx, organizationId, email, verified);
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
