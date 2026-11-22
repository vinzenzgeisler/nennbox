import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import {
  createRequestContext,
  organizationId,
  staticCanonicalOrigin,
} from '@nennbox/core';
import { describe, expect, it } from 'vitest';
import { createDatabase, migrate } from './database-service.js';
import { createStartNumberService } from './start-number-service.js';
import { createPublicRegistrationService } from './public-registration-service.js';
import {
  entries,
  people,
  registrationGroups,
  vehicles,
} from './schema/entries.js';
import { organizations, events, eventClasses } from './schema/organization.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('separate start-number wishes and assignments', () => {
  it('preserves wishes, confirms accepted requests, respects ranges, and serializes cross-column claims', async () => {
    await runMigrations({ connectionString: url! });
    await migrate(url!);
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `assigned-${suffix}`,
          name: 'Assigned',
          timezone: 'UTC',
          locale: 'de',
        })
        .returning();
      const [event] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          slug: suffix,
          name: 'Numbers',
          startsOn: '2030-06-01',
          endsOn: '2030-06-02',
          status: 'open',
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
        })
        .returning();
      const [person] = await db
        .insert(people)
        .values({
          organizationId: org!.id,
          firstName: 'Number',
          lastName: 'Test',
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
        })
        .returning();
      const makeEntry = async (wish: string | null = null) =>
        (
          await db
            .insert(entries)
            .values({
              organizationId: org!.id,
              eventId: event!.id,
              classId: klass!.id,
              registrationGroupId: group!.id,
              driverPersonId: person!.id,
              vehicleId: vehicle!.id,
              orgaCode: crypto.randomUUID(),
              acceptanceStatus: 'accepted',
              requestedStartNumber: wish,
            })
            .returning()
        )[0]!;
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(org!.id),
        permissions: new Set(['entry:write', 'event:write']),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const numbers = createStartNumberService(db);
      await numbers.configure(
        ctx,
        event!.id,
        [
          {
            classId: klass!.id,
            from: 1,
            to: 4,
            reserved: [1],
            mode: 'organizer_assigned',
          },
          {
            classId: klass!.id,
            from: 10,
            to: 15,
            reserved: [],
            mode: 'organizer_assigned',
          },
        ],
        { automaticPromotion: false, confirmationHours: 48 },
      );
      const wished = await makeEntry('12');
      const empty = await makeEntry();
      const plan = await numbers.assignAll(ctx, event!.id, { dryRun: true });
      expect(plan).toContainEqual({ entryId: wished.id, startNumber: '12' });
      expect(plan).toContainEqual({ entryId: empty.id, startNumber: '2' });
      expect(
        (await db.select().from(entries).where(eq(entries.id, wished.id)))[0]!
          .assignedStartNumber,
      ).toBeNull();
      expect(await numbers.assignAll(ctx, event!.id)).toEqual(plan);
      await numbers.assign(ctx, event!.id, wished.id, ' 13 ');
      let [row] = await db
        .select()
        .from(entries)
        .where(eq(entries.id, wished.id));
      expect(row).toMatchObject({
        requestedStartNumber: '12',
        assignedStartNumber: '13',
      });
      await expect(
        numbers.assign(ctx, event!.id, empty.id, '1'),
      ).rejects.toThrow('number-out-of-range');
      await expect(
        numbers.assign(ctx, event!.id, empty.id, '12'),
      ).rejects.toThrow();
      await numbers.assign(ctx, event!.id, wished.id, null);
      [row] = await db.select().from(entries).where(eq(entries.id, wished.id));
      expect(row).toMatchObject({
        requestedStartNumber: '12',
        assignedStartNumber: null,
      });

      const racers = await Promise.all([makeEntry(), makeEntry()]);
      const results = await Promise.allSettled([
        pool.query(
          'update entry set requested_start_number = $1 where id = $2',
          ['14', racers[0]!.id],
        ),
        pool.query(
          'update entry set assigned_start_number = $1 where id = $2',
          ['14', racers[1]!.id],
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason.code).toBe(
        '23505',
      );
      await db
        .update(entries)
        .set({ acceptanceStatus: 'withdrawn' })
        .where(eq(entries.id, racers[0]!.id));
      await db
        .update(entries)
        .set({ acceptanceStatus: 'withdrawn' })
        .where(eq(entries.id, racers[1]!.id));
      const reclaimed = await makeEntry('14');
      await db
        .update(entries)
        .set({ deletedAt: new Date(), deletionReason: 'test' })
        .where(eq(entries.id, reclaimed.id));
      expect((await makeEntry('14')).requestedStartNumber).toBe('14');
    } finally {
      await pool.end();
    }
  });

  it.each(['driver_choice', 'organizer_assigned', 'automatic'] as const)(
    'stores public registration in %s mode without changing the requested value',
    async (mode) => {
      const { db, pool } = await createDatabase(url!);
      const suffix = crypto.randomUUID();
      const consentText = 'Accepted terms';
      const hash = createHash('sha256').update(consentText).digest('hex');
      try {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `mode-${suffix}`,
            name: mode,
            timezone: 'UTC',
            locale: 'de',
          })
          .returning();
        const [event] = await db
          .insert(events)
          .values({
            organizationId: org!.id,
            slug: suffix,
            name: mode,
            status: 'open',
            startsOn: '2030-06-01',
            endsOn: '2030-06-02',
            consentTerms: [
              {
                key: 'participation',
                version: '1',
                language: 'de',
                text: consentText,
                hash,
                required: true,
              },
            ],
          })
          .returning();
        const [klass] = await db
          .insert(eventClasses)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            code: 'OPEN',
            name: 'Open',
            vehicleType: 'car',
            maxParticipants: 50,
          })
          .returning();
        const ctx = createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(org!.id),
          permissions: new Set(),
          capabilities: new Set(),
          correlationId: suffix,
        });
        await createStartNumberService(db).configure(
          ctx,
          event!.id,
          [{ classId: klass!.id, from: 20, to: 25, reserved: [], mode }],
          { automaticPromotion: false, confirmationHours: 48 },
        );
        const service = createPublicRegistrationService(db, {
          canonicalOrigin: staticCanonicalOrigin(
            'https://entries.example.test',
          ),
        });
        await service.submit(ctx, suffix, {
          submissionId: crypto.randomUUID(),
          formVersion: '1.0',
          language: 'de',
          eventSlug: suffix,
          person: {
            firstName: 'Anna',
            lastName: 'Test',
            dateOfBirth: '1990-01-01',
            email: `${suffix}@example.test`,
          },
          entries: [
            {
              classId: klass!.id,
              requestedStartNumber: mode === 'automatic' ? null : '22',
              vehicle: {
                make: 'Test',
                model: 'Car',
                year: 2000,
                registration: null,
              },
            },
          ],
          consents: [
            { key: 'participation', version: '1', hash, accepted: true },
          ],
        });
        const [row] = await db
          .select()
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, org!.id),
              eq(entries.eventId, event!.id),
            ),
          );
        expect(row).toMatchObject({
          requestedStartNumber: mode === 'automatic' ? null : '22',
          assignedStartNumber:
            mode === 'automatic'
              ? '20'
              : mode === 'driver_choice'
                ? '22'
                : null,
        });
        const taken = await service.checkRequestedStartNumber(
          ctx,
          suffix,
          mode === 'automatic' ? '20' : '22',
        );
        expect(taken).toEqual({ available: false });
      } finally {
        await pool.end();
      }
    },
  );
});
