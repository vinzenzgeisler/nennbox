import { and, eq, isNull } from 'drizzle-orm';
import { transitionEntry } from '@nennbox/core';
import {
  createDatabase,
  createEntryRepository,
  createEntryWorkflowRepository,
  createStartNumberService,
  createVehicleRepository,
  entries,
  people,
} from '@nennbox/adapter-postgres';
import { rows, demoRequestedStartNumber } from './community-demo-data.js';
import { demoEmail } from './community-demo-profiles.js';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type Context = Parameters<
  ReturnType<typeof createEntryRepository>['getById']
>[0];

/** Upgrade only recognized fixture wishes; never replace an organizer's assignment. */
export async function seedDemoStartNumbers(
  db: Db,
  ctx: Context,
  eventId: string,
) {
  const seeded = await db
    .select({
      id: entries.id,
      email: people.emailNormalized,
      acceptance: entries.acceptanceStatus,
      wish: entries.requestedStartNumber,
      assigned: entries.assignedStartNumber,
    })
    .from(entries)
    .innerJoin(
      people,
      and(
        eq(people.organizationId, entries.organizationId),
        eq(people.id, entries.driverPersonId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        isNull(entries.deletedAt),
      ),
    );
  const numbers = createStartNumberService(db);
  for (const entry of seeded) {
    const index = rows.findIndex(
      (_, index) => demoEmail(index) === entry.email,
    );
    if (index < 0) continue;
    const row = rows[index]!;
    if (
      entry.wish === row[4] &&
      demoRequestedStartNumber(index) === null &&
      entry.assigned === null
    ) {
      await db
        .update(entries)
        .set({ requestedStartNumber: null })
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, eventId),
            eq(entries.id, entry.id),
            eq(entries.requestedStartNumber, row[4]),
            isNull(entries.assignedStartNumber),
          ),
        );
    }
    if (entry.acceptance === 'accepted' && entry.assigned === null) {
      const assigned = await numbers.assign(
        ctx,
        eventId,
        entry.id,
        entry.wish ?? row[4],
      );
      if (!assigned) throw new Error('Demo start-number assignment failed');
    }
  }
}

/** A real sibling entry makes the existing projection expose a navigable reference. */
export async function seedDemoDoubleStarter(
  db: Db,
  ctx: Context,
  eventId: string,
  primaryClassId: string,
  secondClassId: string,
): Promise<boolean> {
  const [primary] = await db
    .select({ entry: entries })
    .from(entries)
    .innerJoin(
      people,
      and(
        eq(people.organizationId, entries.organizationId),
        eq(people.id, entries.driverPersonId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        eq(entries.classId, primaryClassId),
        eq(people.emailNormalized, demoEmail(0)),
        isNull(entries.deletedAt),
      ),
    )
    .limit(1);
  if (!primary) throw new Error('Demo double starter primary entry missing');
  const [existing] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, ctx.organizationId),
        eq(entries.eventId, eventId),
        eq(entries.registrationGroupId, primary.entry.registrationGroupId),
        eq(entries.driverPersonId, primary.entry.driverPersonId),
        eq(entries.classId, secondClassId),
        isNull(entries.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return false;
  const vehicle = await createVehicleRepository(db).create(ctx, {
    make: 'Honda',
    model: 'RS 250',
    year: 1989,
    registration: 'DEMO-DOUBLE',
  });
  const repo = createEntryRepository(db);
  const entry = await repo.create!(ctx, {
    eventId,
    classId: secondClassId,
    registrationGroupId: primary.entry.registrationGroupId,
    driverPersonId: primary.entry.driverPersonId,
    vehicleId: vehicle.id,
    requestedStartNumber: '169',
    priceSnapshotVersion: null,
    priceSnapshot: null,
    formSnapshotVersion: 'demo-1',
  });
  const deps = { entries: repo, workflows: createEntryWorkflowRepository(db) };
  await transitionEntry(
    ctx,
    entry.id,
    'verification',
    'verified',
    'demo-seed',
    'Beispielprüfung',
    deps,
  );
  await transitionEntry(
    ctx,
    entry.id,
    'acceptance',
    'accepted',
    'demo-seed',
    'Doppelstart in zweiter Klasse',
    deps,
  );
  return true;
}
