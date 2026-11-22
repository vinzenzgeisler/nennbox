import { and, eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from '@nennbox/core';
import {
  createDatabase,
  createEntryRepository,
  createStartNumberService,
  migrate,
  entries,
  emailOutbox,
  messageCampaigns,
  events,
  organizations,
  people,
  vehicles,
} from '@nennbox/adapter-postgres';
import { seedCommunityDemo } from './community-demo-seed.js';
import { legacyDemoGradientImages, rows } from './community-demo-data.js';
import { demoEmail } from './community-demo-profiles.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('community demo seed upgrades', () => {
  it('uses real assignments and starter references and upgrades legacy seeds without replacing uploads', async () => {
    await runMigrations({ connectionString: url! });
    await migrate(url!);
    const { db, pool } = await createDatabase(url!);
    const slug = `demo-seed-${crypto.randomUUID()}`;
    const [org] = await db
      .insert(organizations)
      .values({
        slug,
        name: 'Seed test',
        timezone: 'Europe/Berlin',
        locale: 'de',
      })
      .returning();
    try {
      const options = {
        organizationSlug: slug,
        deploymentMode: 'cloud' as const,
      };
      const initial = await seedCommunityDemo(db, options);
      expect(initial.created).toBe(rows.length + 1);
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(org!.id),
        permissions: new Set(['entry:read', 'entry:write']),
        capabilities: new Set(),
        correlationId: slug,
      });
      const read = () =>
        db
          .select({ entry: entries, email: people.emailNormalized })
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
              eq(entries.organizationId, org!.id),
              eq(entries.eventId, initial.eventId),
            ),
          )
          .orderBy(entries.id);
      const first = await read();
      const accepted = first.filter(
        ({ entry }) => entry.acceptanceStatus === 'accepted',
      );
      expect(accepted.length).toBeGreaterThan(0);
      expect(
        accepted.every(({ entry }) => entry.assignedStartNumber !== null),
      ).toBe(true);
      const others = first.filter(
        ({ entry }) => entry.acceptanceStatus !== 'accepted',
      );
      expect(
        others.every(({ entry }) => entry.assignedStartNumber === null),
      ).toBe(true);
      expect(
        others.some(({ entry }) => entry.requestedStartNumber !== null),
      ).toBe(true);
      expect(
        others.some(({ entry }) => entry.requestedStartNumber === null),
      ).toBe(true);
      const paul = first.filter(({ email }) => email === demoEmail(0));
      expect(paul).toHaveLength(2);
      const repo = createEntryRepository(db);
      for (const own of paul) {
        const sibling = paul.find(({ entry }) => entry.id !== own.entry.id)!;
        const projected = await repo.getById(ctx, own.entry.id);
        expect(
          projected?.statusProjection?.hints.find(
            (hint) => hint.key === 'double_starter',
          ),
        ).toMatchObject({
          present: true,
          relatedEntries: [
            {
              entryId: sibling.entry.id,
              startNumber: sibling.entry.assignedStartNumber,
            },
          ],
        });
      }
      expect(
        (
          await db
            .select()
            .from(vehicles)
            .where(eq(vehicles.organizationId, org!.id))
            .orderBy(vehicles.id)
        ).every((vehicle) => vehicle.imageUrl === null),
      ).toBe(true);

      // Reproduce the old all-wishes/no-assigned-number fixture, including its placeholders.
      for (const [index, row] of rows.entries()) {
        const seeded =
          first.find(
            ({ email, entry }) =>
              email === demoEmail(index) &&
              entry.requestedStartNumber === row[4],
          ) ?? first.find(({ email }) => email === demoEmail(index))!;
        await createStartNumberService(db).assign(
          ctx,
          initial.eventId,
          seeded.entry.id,
          null,
        );
        await db
          .update(entries)
          .set({ requestedStartNumber: row[4] })
          .where(eq(entries.id, seeded.entry.id));
        await db
          .update(vehicles)
          .set({ imageUrl: legacyDemoGradientImages[index % 4]! })
          .where(eq(vehicles.id, seeded.entry.vehicleId));
      }
      const uploaded = first.find(({ email }) => email === demoEmail(3))!.entry;
      const uploadUrl = '/api/uploads/real-car-photo.jpg';
      await db
        .update(vehicles)
        .set({ imageUrl: uploadUrl })
        .where(eq(vehicles.id, uploaded.vehicleId));
      // An arbitrary SVG is not a known demo placeholder either.
      const custom = first.find(({ email }) => email === demoEmail(4))!.entry;
      const customSvg = 'data:image/svg+xml;base64,PHN2Zy8+';
      await db
        .update(vehicles)
        .set({ imageUrl: customSvg })
        .where(eq(vehicles.id, custom.vehicleId));
      await createStartNumberService(db).assign(
        ctx,
        initial.eventId,
        uploaded.id,
        '907',
      );

      const upgraded = await seedCommunityDemo(db, options);
      expect(upgraded.created).toBe(0);
      expect(upgraded.total).toBe(initial.total);
      const after = await read();
      expect(
        after
          .filter(({ entry }) => entry.acceptanceStatus === 'accepted')
          .every(({ entry }) => entry.assignedStartNumber !== null),
      ).toBe(true);
      expect(
        after.find(({ entry }) => entry.id === uploaded.id)?.entry
          .assignedStartNumber,
      ).toBe('907');
      expect(
        after.some(
          ({ entry }) =>
            entry.requestedStartNumber === null &&
            entry.assignedStartNumber === null,
        ),
      ).toBe(true);
      const images = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.organizationId, org!.id))
        .orderBy(vehicles.id);
      expect(
        images.find((vehicle) => vehicle.id === uploaded.vehicleId)?.imageUrl,
      ).toBe(uploadUrl);
      expect(
        images.find((vehicle) => vehicle.id === custom.vehicleId)?.imageUrl,
      ).toBe(customSvg);
      expect(
        images
          .filter(
            (vehicle) =>
              vehicle.id !== uploaded.vehicleId &&
              vehicle.id !== custom.vehicleId,
          )
          .every((vehicle) => vehicle.imageUrl === null),
      ).toBe(true);

      await seedCommunityDemo(db, options);
      expect(await read()).toEqual(after);
      expect(
        await db
          .select()
          .from(vehicles)
          .where(eq(vehicles.organizationId, org!.id))
          .orderBy(vehicles.id),
      ).toEqual(images);
    } finally {
      try {
        await db
          .delete(messageCampaigns)
          .where(eq(messageCampaigns.organizationId, org!.id));
        await db
          .delete(emailOutbox)
          .where(eq(emailOutbox.organizationId, org!.id));
        await db.delete(events).where(eq(events.organizationId, org!.id));
        await db.delete(organizations).where(eq(organizations.id, org!.id));
      } finally {
        await pool.end();
      }
    }
  }, 60_000);
});
