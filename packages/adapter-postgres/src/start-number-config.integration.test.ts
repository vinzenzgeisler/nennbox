import { eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { createRequestContext, organizationId } from '@nennbox/core';
import { describe, expect, it } from 'vitest';
import { createDatabase, migrate } from './database-service.js';
import { createStartNumberService } from './start-number-service.js';
import { organizations, events, eventClasses } from './schema/organization.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('atomic start-number configuration', () => {
  it('commits ranges, settings and capacities together and rolls all back on a late database failure', async () => {
    await runMigrations({ connectionString: url! });
    await migrate(url!);
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `atomic-numbers-${suffix}`,
          name: 'Atomic numbers',
          timezone: 'UTC',
          locale: 'de',
        })
        .returning();
      const [event, otherEvent] = await db
        .insert(events)
        .values(
          ['numbers', 'other'].map((slug) => ({
            organizationId: org!.id,
            slug: `${slug}-${suffix}`,
            name: slug,
            startsOn: '2030-06-01',
            endsOn: '2030-06-02',
            status: 'draft',
          })),
        )
        .returning();
      const [first, second, foreign] = await db
        .insert(eventClasses)
        .values(
          [event!.id, event!.id, otherEvent!.id].map((eventId, index) => ({
            organizationId: org!.id,
            eventId,
            name: `Class ${index}`,
            code: `C${index}`,
            vehicleType: 'car',
            maxParticipants: 10,
          })),
        )
        .returning();
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(org!.id),
        permissions: new Set(['event:write', 'class:write']),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const service = createStartNumberService(db);
      const ranges = [
        {
          classId: first!.id,
          from: 1,
          to: 50,
          reserved: [7],
          mode: 'automatic' as const,
        },
      ];
      const settings = { automaticPromotion: true, confirmationHours: 24 };
      await service.configure(ctx, event!.id, ranges, settings, [
        { classId: first!.id, maxParticipants: 25 },
        { classId: second!.id, maxParticipants: null },
      ]);
      const saved = await service.list(ctx, event!.id);
      expect(saved).toMatchObject({ ranges, settings });
      const capacities = async () =>
        (
          await db
            .select()
            .from(eventClasses)
            .where(eq(eventClasses.eventId, event!.id))
        )
          .map(({ id, maxParticipants }) => ({ id, maxParticipants }))
          .sort((a, b) => a.id.localeCompare(b.id));
      const savedCapacities = await capacities();
      expect(savedCapacities).toEqual(
        [
          { id: first!.id, maxParticipants: 25 },
          { id: second!.id, maxParticipants: null },
        ].sort((a, b) => a.id.localeCompare(b.id)),
      );

      // The settings constraint fails after ranges and capacities were written.
      await expect(
        service.configure(
          ctx,
          event!.id,
          [{ ...ranges[0]!, from: 100, to: 150, reserved: [] }],
          { automaticPromotion: false, confirmationHours: 0 },
          [
            { classId: first!.id, maxParticipants: 5 },
            { classId: second!.id, maxParticipants: 6 },
          ],
        ),
      ).rejects.toThrow();
      expect(await service.list(ctx, event!.id)).toEqual(saved);
      expect(await capacities()).toEqual(savedCapacities);

      await expect(
        service.configure(ctx, event!.id, [], settings, [
          { classId: first!.id, maxParticipants: 2 },
          { classId: foreign!.id, maxParticipants: 3 },
        ]),
      ).rejects.toThrow('invalid-capacity');
      expect(await service.list(ctx, event!.id)).toEqual(saved);
      expect(await capacities()).toEqual(savedCapacities);
      expect(
        (
          await db
            .select()
            .from(eventClasses)
            .where(eq(eventClasses.id, foreign!.id))
        )[0]!.maxParticipants,
      ).toBe(10);

      // Existing clients omitting capacities do not reset them.
      await service.configure(ctx, event!.id, ranges, settings);
      expect(await capacities()).toEqual(savedCapacities);
    } finally {
      await pool.end();
    }
  });
});
