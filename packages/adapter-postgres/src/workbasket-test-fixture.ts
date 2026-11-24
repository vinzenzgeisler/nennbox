import { sql } from 'drizzle-orm';
import { createRequestContext, organizationId } from '@nennbox/core';
import type { Database } from './database.js';
import { organizations, events, eventClasses } from './schema/organization.js';
import {
  people,
  registrationGroups,
  vehicles,
  entries,
} from './schema/entries.js';

export function workbasketSeed(db: Database) {
  const suffix = crypto.randomUUID();
  const seed = async (label: string) => {
    const [org] = await db
      .insert(organizations)
      .values({
        slug: label + suffix,
        name: label,
        timezone: 'Europe/Berlin',
        locale: 'de',
      })
      .returning();
    const [event] = await db
      .insert(events)
      .values({
        organizationId: org!.id,
        slug: 'test',
        name: 'Test',
        startsOn: '2030-06-01',
        endsOn: '2030-06-01',
      })
      .returning();
    const [klass] = await db
      .insert(eventClasses)
      .values({
        organizationId: org!.id,
        eventId: event!.id,
        name: 'Open',
        code: 'OPEN',
        vehicleType: 'car',
        maxParticipants: 2,
        maxDisplacementCc: 2000,
      })
      .returning();
    const [person] = await db
      .insert(people)
      .values({
        organizationId: org!.id,
        firstName: 'Erika',
        lastName: 'Test',
        dateOfBirth: '2000-01-01',
      })
      .returning();
    const [group] = await db
      .insert(registrationGroups)
      .values({
        organizationId: org!.id,
        eventId: event!.id,
        personId: person!.id,
      })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        organizationId: org!.id,
        make: 'Test',
        model: 'Car',
        displacementCc: 2100,
      })
      .returning();
    const [entry] = await db
      .insert(entries)
      .values({
        organizationId: org!.id,
        eventId: event!.id,
        classId: klass!.id,
        registrationGroupId: group!.id,
        driverPersonId: person!.id,
        vehicleId: vehicle!.id,
        orgaCode: label + suffix,
      })
      .returning();
    const ctx = createRequestContext({
      deploymentMode: 'cloud',
      organizationId: organizationId(org!.id),
      permissions: new Set(),
      capabilities: new Set(),
      correlationId: suffix,
    });
    return {
      org: org!,
      event: event!,
      klass: klass!,
      person: person!,
      group: group!,
      vehicle: vehicle!,
      entry: entry!,
      ctx,
    };
  };
  return seed;
}
