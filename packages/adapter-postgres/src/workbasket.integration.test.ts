import { sql } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import { createRequestContext, organizationId } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createWorkbasketRepository } from './workbasket.js';
import { organizations, events, eventClasses } from './schema/organization.js';
import {
  people,
  registrationGroups,
  vehicles,
  entries,
} from './schema/entries.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)(
  'workbasket PostgreSQL invalidation and isolation',
  () => {
    it('caches unchanged reads; recomputes only affected events; isolates reads, writes and shared identities', async () => {
      const { db, pool } = await createDatabase(url!);
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
      try {
        const a = await seed('basket-a'),
          b = await seed('basket-b');
        const repo = createWorkbasketRepository(db);
        const first = await repo.tasks(a.ctx, a.event.id);
        expect(first?.tasks).toContainEqual(
          expect.objectContaining({
            ruleId: 'displacement',
            entryId: a.entry.id,
            severity: 'warning',
          }),
        );
        expect((await repo.tasks(a.ctx, a.event.id))?.generation).toBe(
          first?.generation,
        );
        const second = await repo.tasks(b.ctx, b.event.id);
        expect(await repo.tasks(a.ctx, b.event.id)).toBeNull();
        expect(await repo.warnings(a.ctx, b.event.id, b.entry.id)).toBeNull();
        expect(await repo.configure(a.ctx, b.event.id, {})).toBeNull();
        expect(await repo.getConfiguration(a.ctx, b.event.id)).toBeNull();
        await expect(
          repo.configure(a.ctx, a.event.id, { unknown: { enabled: true } }),
        ).rejects.toThrow();
        await repo.configure(a.ctx, null, {
          missingDocuments: { days: 12 },
          displacement: { enabled: false },
        });
        await repo.configure(a.ctx, a.event.id, {
          missingDocuments: { days: 3 },
        });
        const config = await repo.getConfiguration(a.ctx, a.event.id);
        expect(config?.effective.missingDocuments).toEqual({
          enabled: true,
          days: 3,
        });
        expect(config?.effective.displacement.enabled).toBe(false);
        const configured = await repo.tasks(a.ctx, a.event.id);
        expect(configured?.generation).toBe(first!.generation + 1);
        expect(configured?.tasks.some((t) => t.ruleId === 'displacement')).toBe(
          false,
        );
        expect((await repo.tasks(b.ctx, b.event.id))?.generation).toBe(
          second?.generation,
        );
        // Direct SQL updates prove invalidation is not dependent on one application write path.
        await db.execute(
          sql`UPDATE vehicle SET displacement_cc=1900 WHERE organization_id=${a.org.id} AND id=${a.vehicle.id}`,
        );
        const edited = await repo.tasks(a.ctx, a.event.id);
        expect(edited?.generation).toBe(configured!.generation + 1);
        expect((await repo.tasks(a.ctx, a.event.id))?.generation).toBe(
          edited?.generation,
        );
        await db.execute(
          sql`UPDATE person SET date_of_birth='2020-06-02' WHERE organization_id=${a.org.id} AND id=${a.person.id}`,
        );
        const minor = await repo.warnings(a.ctx, a.event.id, a.entry.id);
        expect(minor).toContainEqual(
          expect.objectContaining({
            ruleId: 'minorGuardian',
            fields: expect.arrayContaining(['dateOfBirth']),
          }),
        );
        await db.execute(
          sql`UPDATE registration_group SET guardian_name='Elternteil' WHERE organization_id=${a.org.id} AND id=${a.group.id}`,
        );
        expect(
          (await repo.warnings(a.ctx, a.event.id, a.entry.id))?.some(
            (t) => t.ruleId === 'minorGuardian',
          ),
        ).toBe(false);
        await db.execute(
          sql`UPDATE workbasket_cache SET valid_until=now()-interval '1 second' WHERE organization_id=${a.org.id} AND event_id=${a.event.id}`,
        );
        const before = (await repo.tasks(a.ctx, a.event.id))!;
        const parallel = await Promise.all([
          repo.tasks(a.ctx, a.event.id),
          repo.tasks(a.ctx, a.event.id),
        ]);
        expect(parallel.map((r) => r?.generation)).toEqual([
          before.generation,
          before.generation,
        ]);
        expect((await repo.tasks(b.ctx, b.event.id))?.generation).toBe(
          second?.generation,
        );
        for (const task of before.tasks) {
          expect(task.reason.length).toBeGreaterThan(5);
          expect(task.fields.length).toBeGreaterThan(0);
        }
      } finally {
        await pool.end();
      }
    });
  },
);
