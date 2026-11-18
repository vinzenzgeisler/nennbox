import { and, eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { createRequestContext, organizationId } from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createStartNumberService,
  advanceExpiredWaitlistOffers,
  entries,
  eventClasses,
  eventWaitlistSettings,
  events,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';
import { offerWaitlistSeat } from './waitlist-offer.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
describe.skipIf(!url)('start-number ranges and waitlist concurrency', () => {
  it('isolates configuration by organization and serializes simultaneous cancellations to distinct waitlist entries', async () => {
    await runMigrations({ connectionString: url! });
    const first = await createDatabase(url!);
    const second = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const seed = async (label: string) => {
        const [org] = await first.db
          .insert(organizations)
          .values({
            slug: `numbers-${label}-${suffix}`,
            name: label,
            timezone: 'UTC',
            locale: 'de',
          })
          .returning();
        const [event] = await first.db
          .insert(events)
          .values({
            organizationId: org!.id,
            slug: `event-${label}`,
            name: `Event ${label}`,
            startsOn: '2030-06-01',
            endsOn: '2030-06-02',
            status: 'open',
          })
          .returning();
        const [klass] = await first.db
          .insert(eventClasses)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            name: 'Open',
            code: 'OPEN',
            vehicleType: 'car',
            maxParticipants: 2,
          })
          .returning();
        const entriesForClass = [];
        for (let index = 0; index < 5; index += 1) {
          const [person] = await first.db
            .insert(people)
            .values({
              organizationId: org!.id,
              firstName: `Driver${index}`,
              lastName: label,
              email: `driver${index}-${label}@example.test`,
            })
            .returning();
          const [group] = await first.db
            .insert(registrationGroups)
            .values({
              organizationId: org!.id,
              eventId: event!.id,
              personId: person!.id,
              contactEmail: person!.email,
            })
            .returning();
          const [vehicle] = await first.db
            .insert(vehicles)
            .values({
              organizationId: org!.id,
              make: 'Test',
              model: `${index}`,
            })
            .returning();
          const [entry] = await first.db
            .insert(entries)
            .values({
              organizationId: org!.id,
              eventId: event!.id,
              classId: klass!.id,
              registrationGroupId: group!.id,
              driverPersonId: person!.id,
              vehicleId: vehicle!.id,
              orgaCode: `${label}-${suffix}-${index}`,
              acceptanceStatus: index < 2 ? 'accepted' : 'waitlisted',
              waitlistPosition: index < 2 ? null : index - 1,
            })
            .returning();
          entriesForClass.push(entry!);
        }
        await first.db.insert(eventWaitlistSettings).values({
          organizationId: org!.id,
          eventId: event!.id,
          automaticPromotion: true,
          confirmationHours: 48,
        });
        return {
          org: org!,
          event: event!,
          klass: klass!,
          entries: entriesForClass,
        };
      };
      const a = await seed('a');
      const b = await seed('b');
      const context = (org: string) =>
        createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(org),
          permissions: new Set(['event:write', 'entry:write']),
          capabilities: new Set(),
          correlationId: suffix,
        });
      const numbers = createStartNumberService(first.db);
      await numbers.configure(
        context(a.org.id),
        a.event.id,
        [
          {
            classId: a.klass.id,
            from: 1,
            to: 4,
            reserved: [1],
            mode: 'automatic',
          },
        ],
        { automaticPromotion: true, confirmationHours: 48 },
      );
      expect(
        (await numbers.list(context(b.org.id), b.event.id)).ranges,
      ).toEqual([]);
      expect(await numbers.assignAll(context(a.org.id), a.event.id)).toEqual([
        { entryId: a.entries[0]!.id, startNumber: '2' },
        { entryId: a.entries[1]!.id, startNumber: '3' },
      ]);
      expect(await numbers.assignAll(context(b.org.id), b.event.id)).toEqual(
        [],
      );
      const cancelAndOffer = (
        db: typeof first.db,
        row: (typeof a.entries)[number],
      ) =>
        db.transaction(async (tx) => {
          await tx
            .update(entries)
            .set({ acceptanceStatus: 'withdrawn' })
            .where(
              and(eq(entries.organizationId, a.org.id), eq(entries.id, row.id)),
            );
          return offerWaitlistSeat({
            tx,
            ctx: context(a.org.id),
            eventId: a.event.id,
            classId: a.klass.id,
          });
        });
      const [offerOne, offerTwo] = await Promise.all([
        cancelAndOffer(first.db, a.entries[0]!),
        cancelAndOffer(second.db, a.entries[1]!),
      ]);
      expect(offerOne).not.toBeNull();
      expect(offerTwo).not.toBeNull();
      expect(new Set([offerOne!.entryId, offerTwo!.entryId])).toEqual(
        new Set([a.entries[2]!.id, a.entries[3]!.id]),
      );
      const finalWaitlist = await first.db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, a.org.id),
            eq(entries.acceptanceStatus, 'waitlisted'),
          ),
        );
      expect(
        finalWaitlist.filter(
          (entry) => entry.waitlistConfirmationDeadline !== null,
        ),
      ).toHaveLength(2);
      const now = new Date(Date.now() + 49 * 60 * 60 * 1000);
      expect(await advanceExpiredWaitlistOffers(first.db, a.org.id, now)).toBe(
        1,
      );
      const bEntries = await first.db
        .select()
        .from(entries)
        .where(eq(entries.organizationId, b.org.id));
      expect(
        bEntries.every((entry) => entry.waitlistConfirmationDeadline === null),
      ).toBe(true);
      const expiredA = await first.db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, a.org.id),
            eq(entries.acceptanceStatus, 'waitlisted'),
          ),
        );
      expect(
        expiredA.find((entry) => entry.id === a.entries[4]!.id)
          ?.waitlistConfirmationDeadline,
      ).not.toBeNull();
      expect(
        expiredA.find((entry) => entry.id === a.entries[2]!.id)
          ?.waitlistConfirmationDeadline,
      ).toBeNull();
    } finally {
      await Promise.all([first.pool.end(), second.pool.end()]);
    }
  });
});
