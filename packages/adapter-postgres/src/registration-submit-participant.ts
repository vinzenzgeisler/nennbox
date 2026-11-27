import { entryHoldsClassSeat, entryHoldsPlace } from './entry-occupancy.js';
import type { RequestContext } from '@nennbox/core';
import { RegistrationUnavailable } from '@nennbox/core';
import {
  normalizeEmail,
  normalizeRequestedStartNumber,
  availableStartNumbers,
} from '@nennbox/core';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { people, entries } from './schema/entries.js';
import { eventClasses } from './schema/organization.js';
import { startNumberRanges } from './schema/start-numbers.js';
import type {
  RegistrationSubmissionEvent,
  RegistrationSubmissionSettings,
  RegistrationSubmissionTransaction,
} from './registration-submit-types.js';

function normalizedName(value: string) {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export async function resolveRegistrationParticipant(args: {
  tx: RegistrationSubmissionTransaction;
  ctx: RequestContext;
  event: RegistrationSubmissionEvent;
  payload: import('./registration-settings.js').PublicRegistrationPayload;
  settings: RegistrationSubmissionSettings;
}): Promise<{
  personId: string;
  needsGuardian: boolean;
  uniqueClassIds: string[];
  waitlistEntryIndexes: number[];
  automaticStartNumbers: Array<string | null>;
}> {
  const { tx, ctx, event, payload, settings } = args;
  const emailNormalized = normalizeEmail(payload.person.email);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:email:${emailNormalized}`}, 0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:person:${normalizedName(payload.person.firstName)}:${normalizedName(payload.person.lastName)}:${payload.person.dateOfBirth}`}, 0))`,
  );
  const dob = payload.person.dateOfBirth
    ? new Date(`${payload.person.dateOfBirth}T00:00:00.000Z`)
    : null;
  const eventStart = new Date(`${event.startsOn}T00:00:00.000Z`);
  if (
    (dob && (!Number.isFinite(dob.getTime()) || dob > eventStart)) ||
    (!dob && settings.minimumAge !== null)
  )
    throw new RegistrationUnavailable('invalid-participant');
  let age = dob ? eventStart.getUTCFullYear() - dob.getUTCFullYear() : null;
  if (
    dob &&
    (eventStart.getUTCMonth() < dob.getUTCMonth() ||
      (eventStart.getUTCMonth() === dob.getUTCMonth() &&
        eventStart.getUTCDate() < dob.getUTCDate()))
  )
    age!--;
  if (settings.minimumAge !== null && age !== null && age < settings.minimumAge)
    throw new RegistrationUnavailable('age-restricted');
  const needsGuardian = age !== null && age < settings.guardianRequiredBelowAge;
  if (
    needsGuardian &&
    (!payload.person.guardianName?.trim() || !payload.person.guardianEmail)
  )
    throw new RegistrationUnavailable('guardian-required');
  const uniqueClassIds = [
    ...new Set(payload.entries.map((entry) => entry.classId)),
  ];
  if (uniqueClassIds.length > settings.maximumClassesPerGroup)
    throw new RegistrationUnavailable('too-many-classes');
  const classes = await tx
    .select()
    .from(eventClasses)
    .where(
      and(
        eq(eventClasses.organizationId, ctx.organizationId),
        eq(eventClasses.eventId, event.id),
        inArray(eventClasses.id, uniqueClassIds),
      ),
    )
    .orderBy(eventClasses.id)
    .for('update');
  if (
    classes.length !== uniqueClassIds.length ||
    classes.some((eventClass) => eventClass.closed)
  )
    throw new RegistrationUnavailable('class-unavailable');
  const numberRanges = await tx
    .select()
    .from(startNumberRanges)
    .where(
      and(
        eq(startNumberRanges.organizationId, ctx.organizationId),
        eq(startNumberRanges.eventId, event.id),
      ),
    );
  const automaticStartNumbers = Array<string | null>(
    payload.entries.length,
  ).fill(null);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:start-numbers:${event.id}`}, 0))`,
  );
  const assignedRows = await tx
    .select({
      wish: entries.requestedStartNumber,
      assigned: entries.assignedStartNumber,
    })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, event.id),
        sql`${entries.deletedAt} is null`,
        entryHoldsPlace(),
      ),
    );
  const usedNumbers = assignedRows.flatMap((row) =>
    [row.wish, row.assigned].filter(
      (number): number is string => number !== null,
    ),
  );
  for (const [index, submitted] of payload.entries.entries()) {
    const classRanges = numberRanges.filter(
      (range) => range.classId === submitted.classId,
    );
    const applicableRanges = (
      classRanges.length
        ? classRanges
        : numberRanges.filter((range) => range.classId === null)
    ).sort((a, b) => a.rangeFrom - b.rangeFrom);
    const mode = applicableRanges[0]?.assignmentMode;
    const requested = normalizeRequestedStartNumber(
      submitted.requestedStartNumber,
    );
    if (mode === 'automatic') {
      if (requested) throw new RegistrationUnavailable('class-unavailable');
      let assigned: string | undefined;
      for (const range of applicableRanges) {
        assigned = availableStartNumbers(
          {
            from: range.rangeFrom,
            to: range.rangeTo,
            reserved: range.reservedNumbers,
            classId: range.classId,
          },
          usedNumbers,
        )[0];
        if (assigned) break;
      }
      if (!assigned) throw new RegistrationUnavailable('class-unavailable');
      automaticStartNumbers[index] = assigned;
      usedNumbers.push(assigned);
    } else if (
      requested &&
      applicableRanges.length &&
      !applicableRanges.some(
        (range) =>
          /^\d+$/.test(requested) &&
          Number(requested) >= range.rangeFrom &&
          Number(requested) <= range.rangeTo &&
          !range.reservedNumbers.includes(Number(requested)),
      )
    ) {
      throw new RegistrationUnavailable('class-unavailable');
    } else if (requested) {
      if (mode !== 'organizer_assigned')
        automaticStartNumbers[index] = requested;
      usedNumbers.push(requested);
    }
  }
  const waitlistEntryIndexes: number[] = [];
  for (const eventClass of classes) {
    const count = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(entries)
      .where(
        and(
          eq(entries.organizationId, ctx.organizationId),
          eq(entries.eventId, event.id),
          eq(entries.classId, eventClass.id),
          sql`${entries.deletedAt} is null`,
          entryHoldsClassSeat(),
        ),
      );
    if (eventClass.maxParticipants !== null) {
      let occupied = Number(count[0]?.count ?? 0);
      for (const [index, submitted] of payload.entries.entries()) {
        if (submitted.classId !== eventClass.id) continue;
        if (occupied >= eventClass.maxParticipants)
          waitlistEntryIndexes.push(index);
        else occupied += 1;
      }
    }
  }
  const emailOwners = await tx
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      dateOfBirth: people.dateOfBirth,
    })
    .from(people)
    .where(
      and(
        eq(people.organizationId, ctx.organizationId),
        eq(people.emailNormalized, emailNormalized),
        sql`${people.deletedAt} is null`,
      ),
    );
  const samePerson = emailOwners.find(
    (person) =>
      normalizedName(person.firstName) ===
        normalizedName(payload.person.firstName) &&
      normalizedName(person.lastName) ===
        normalizedName(payload.person.lastName) &&
      person.dateOfBirth === payload.person.dateOfBirth,
  );
  if (
    settings.sharedContactEmail === 'disallowed' &&
    emailOwners.some((person) => person.id !== samePerson?.id)
  )
    throw new RegistrationUnavailable('shared-email-disallowed');
  let personId = samePerson?.id;
  if (!personId) {
    const sameBirthDate = payload.person.dateOfBirth
      ? await tx
          .select({
            id: people.id,
            firstName: people.firstName,
            lastName: people.lastName,
          })
          .from(people)
          .where(
            and(
              eq(people.organizationId, ctx.organizationId),
              eq(people.dateOfBirth, payload.person.dateOfBirth),
              sql`${people.deletedAt} is null`,
            ),
          )
      : [];
    if (
      sameBirthDate.some(
        (person) =>
          normalizedName(person.firstName) ===
            normalizedName(payload.person.firstName) &&
          normalizedName(person.lastName) ===
            normalizedName(payload.person.lastName),
      )
    )
      throw new RegistrationUnavailable('invalid-participant');
    const [person] = await tx
      .insert(people)
      .values({
        organizationId: ctx.organizationId,
        firstName: payload.person.firstName.trim(),
        lastName: payload.person.lastName.trim(),
        email: payload.person.email.trim(),
        emailNormalized,
        dateOfBirth: payload.person.dateOfBirth ?? null,
        country: payload.person.country ?? null,
      })
      .returning({ id: people.id });
    personId = person!.id;
  }
  return {
    personId,
    needsGuardian,
    uniqueClassIds,
    waitlistEntryIndexes,
    automaticStartNumbers,
  };
}
