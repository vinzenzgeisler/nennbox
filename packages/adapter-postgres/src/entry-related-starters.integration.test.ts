import { createRequestContext, organizationId } from '@nennbox/core';
import type { Entry } from '@nennbox/core';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEntryRepository,
  entries,
  eventClasses,
  events,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('entry related starter projections', () => {
  it('projects all same-event driver entries on detail and filtered, paginated admin reads', async () => {
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const orgIds: string[] = [];
    try {
      const seedTenant = async (label: string) => {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `related-starters-${label}-${suffix}`,
            name: 'Related starters',
            timezone: 'UTC',
            locale: 'de',
          })
          .returning();
        orgIds.push(org!.id);
        const [driver] = await db
          .insert(people)
          .values({
            organizationId: org!.id,
            firstName: 'Same',
            lastName: 'Driver',
          })
          .returning();
        const [vehicle] = await db
          .insert(vehicles)
          .values({ organizationId: org!.id, make: 'NSU', model: 'TT' })
          .returning();
        return { org: org!, driver: driver!, vehicle: vehicle! };
      };
      const a = await seedTenant('a');
      const b = await seedTenant('b');
      type Tenant = typeof a;
      const seedEvent = async (tenant: Tenant, slug: string) => {
        const [event] = await db
          .insert(events)
          .values({
            organizationId: tenant.org.id,
            slug,
            name: slug,
            startsOn: '2030-01-01',
            endsOn: '2030-01-01',
          })
          .returning();
        const [klass] = await db
          .insert(eventClasses)
          .values({
            organizationId: tenant.org.id,
            eventId: event!.id,
            name: 'Touring',
            code: 'TOUR',
            vehicleType: 'car',
          })
          .returning();
        return { event: event!, klass: klass! };
      };
      const first = await seedEvent(a, 'first');
      const second = await seedEvent(a, 'second');
      const foreign = await seedEvent(b, 'first');
      const [otherClass] = await db
        .insert(eventClasses)
        .values({
          organizationId: a.org.id,
          eventId: first.event.id,
          name: 'Other class',
          code: 'OTHER',
          vehicleType: 'car',
        })
        .returning();
      const seedEntry = async (
        tenant: Tenant,
        target: typeof first,
        requestedStartNumber: string,
        options: Partial<typeof entries.$inferInsert> = {},
      ) => {
        // Separate registration groups must not prevent matching the same driver.
        const [group] = await db
          .insert(registrationGroups)
          .values({
            organizationId: tenant.org.id,
            eventId: target.event.id,
            personId: tenant.driver.id,
          })
          .returning();
        const [entry] = await db
          .insert(entries)
          .values({
            organizationId: tenant.org.id,
            eventId: target.event.id,
            classId: target.klass.id,
            registrationGroupId: group!.id,
            driverPersonId: tenant.driver.id,
            vehicleId: tenant.vehicle.id,
            orgaCode: `TEST-${crypto.randomUUID()}`,
            requestedStartNumber,
            ...options,
          })
          .returning();
        return entry!;
      };
      const primary = await seedEntry(a, first, '11', {
        assignedStartNumber: '101',
      });
      const assigned = await seedEntry(a, first, '12', {
        assignedStartNumber: '102',
        classId: otherClass!.id,
      });
      const wishOnly = await seedEntry(a, first, '13', {
        classId: otherClass!.id,
      });
      await seedEntry(a, first, '14', {
        assignedStartNumber: '104',
        deletedAt: new Date(),
        deletionReason: 'Test deleted entry',
      });
      const otherEvent = await seedEntry(a, second, '21', {
        assignedStartNumber: '201',
      });
      const [otherDriver] = await db
        .insert(people)
        .values({
          organizationId: a.org.id,
          firstName: a.driver.firstName,
          lastName: a.driver.lastName,
        })
        .returning();
      const sameName = await seedEntry(
        { ...a, driver: otherDriver! },
        first,
        '31',
        { assignedStartNumber: '301' },
      );
      const foreignPrimary = await seedEntry(b, foreign, '11', {
        assignedStartNumber: '101',
      });
      const foreignRelated = await seedEntry(b, foreign, '12', {
        assignedStartNumber: '102',
      });

      const ctx = (tenant: Tenant) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(tenant.org.id),
          permissions: new Set(['entry:read']),
          capabilities: new Set(),
          correlationId: suffix,
        });
      const repo = createEntryRepository(db);
      const relatedHint = (entry: Entry | null | undefined) => {
        expect(entry).toBeDefined();
        expect(entry).not.toBeNull();
        const hint = entry?.statusProjection?.hints.find(
          (item) => item.key === 'double_starter',
        );
        expect(hint).toBeDefined();
        return hint!;
      };
      const expectRelated = (
        entry: Entry | null | undefined,
        expected: { entryId: string; startNumber: string | null }[],
      ) => {
        const hint = relatedHint(entry);
        expect(hint.present).toBe(expected.length > 0);
        expect(hint.relatedEntries ?? []).toHaveLength(expected.length);
        expect(hint.relatedEntries ?? []).toEqual(
          expect.arrayContaining(expected),
        );
      };

      const primaryRelations = [
        { entryId: assigned.id, startNumber: '102' },
        { entryId: wishOnly.id, startNumber: null },
      ];
      expectRelated(await repo.getById(ctx(a), primary.id), primaryRelations);
      expectRelated(await repo.getById(ctx(a), assigned.id), [
        { entryId: primary.id, startNumber: '101' },
        { entryId: wishOnly.id, startNumber: null },
      ]);
      expectRelated(await repo.getById(ctx(a), wishOnly.id), [
        { entryId: primary.id, startNumber: '101' },
        { entryId: assigned.id, startNumber: '102' },
      ]);
      expectRelated(await repo.getById(ctx(a), otherEvent.id), []);
      expectRelated(await repo.getById(ctx(a), sameName.id), []);
      expect(await repo.getById(ctx(b), primary.id)).toBeNull();
      expectRelated(await repo.getById(ctx(b), foreignPrimary.id), [
        { entryId: foreignRelated.id, startNumber: '102' },
      ]);

      const query = {
        page: 1,
        pageSize: 1,
        sort: 'requestedStartNumber' as const,
        direction: 'asc' as const,
      };
      // Both siblings are outside this page; the class filter excludes them too.
      const filtered = await repo.listAdmin(ctx(a), {
        ...query,
        eventId: first.event.id,
        classId: first.klass.id,
      });
      expect(filtered.total).toBe(2);
      expect(filtered.items.map((item) => item.id)).toEqual([primary.id]);
      expectRelated(filtered.items[0], primaryRelations);
      const pageTwo = await repo.listAdmin(ctx(a), {
        ...query,
        eventId: first.event.id,
        page: 2,
      });
      expect(pageTwo.total).toBe(4);
      expect(pageTwo.items.map((item) => item.id)).toEqual([assigned.id]);
      expectRelated(pageTwo.items[0], [
        { entryId: primary.id, startNumber: '101' },
        { entryId: wishOnly.id, startNumber: null },
      ]);

      // A tenant-wide read spans events without merging the same driver's groups.
      const all = await repo.listAdmin(ctx(a), { ...query, pageSize: 100 });
      expect(all.total).toBe(5);
      expectRelated(
        all.items.find((item) => item.id === primary.id),
        primaryRelations,
      );
      expectRelated(
        all.items.find((item) => item.id === otherEvent.id),
        [],
      );
      expectRelated(
        all.items.find((item) => item.id === sameName.id),
        [],
      );

      // A stored hint remains true even without any actual sibling entry.
      await db
        .update(entries)
        .set({
          statusHints: {
            double_starter: true,
            passenger: false,
            late_entry: false,
          },
        })
        .where(eq(entries.id, sameName.id));
      const storedHint = relatedHint(await repo.getById(ctx(a), sameName.id));
      expect(storedHint.present).toBe(true);
      expect(storedHint.relatedEntries ?? []).toEqual([]);
    } finally {
      for (const id of orgIds) {
        await db.delete(events).where(eq(events.organizationId, id));
        await db.delete(organizations).where(eq(organizations.id, id));
      }
      await pool.end();
    }
  });
});
