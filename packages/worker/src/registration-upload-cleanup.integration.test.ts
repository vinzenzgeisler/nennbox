import { inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { runMigrations } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  events,
  migrate,
  organizations,
  people,
  registrationFormUploads,
  registrationGroups,
  type Database,
} from '@racepilot/adapter-postgres';
import type { ObjectStorageProvider } from '@racepilot/core';
import { createProductWorker } from './product.js';

const databaseUrl = process.env.RACEPILOT_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)(
  'registration upload retention',
  { timeout: 120_000 },
  () => {
    let db: Database;
    let close: () => Promise<void>;
    const organizationIds: string[] = [];
    const eventIds: string[] = [];
    let groupId = '';
    const deleted: string[] = [];
    const failObjects = new Set<string>();
    let task: () => Promise<void>;

    const makeUpload = async (
      organizationId: string,
      eventId: string,
      linked = false,
    ) => {
      const objectId = crypto.randomUUID();
      await db.insert(registrationFormUploads).values({
        organizationId,
        eventId,
        ...(linked ? { registrationGroupId: groupId } : {}),
        fieldKey: 'vehicle_photo',
        objectId,
        uploadTokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      });
      return objectId;
    };

    beforeAll(async () => {
      const url = databaseUrl ?? '';
      await migrate(url);
      await runMigrations({ connectionString: url });
      const first = await createDatabase(url);
      db = first.db;
      close = () => first.pool.end();
      const suffix = crypto.randomUUID().slice(0, 8);
      for (const label of ['a', 'b']) {
        const [organization] = await db
          .insert(organizations)
          .values({
            slug: `upload-cleanup-${label}-${suffix}`,
            name: `Upload cleanup ${label}`,
            timezone: 'UTC',
            locale: 'en',
          })
          .returning();
        if (!organization) throw new Error('Organization fixture failed');
        organizationIds.push(organization.id);
        const [event] = await db
          .insert(events)
          .values({
            organizationId: organization.id,
            slug: `upload-cleanup-${label}`,
            name: `Upload cleanup ${label}`,
            startsOn: '2031-01-01',
            endsOn: '2031-01-02',
          })
          .returning();
        if (!event) throw new Error('Event fixture failed');
        eventIds.push(event.id);
      }
      const [person] = await db
        .insert(people)
        .values({
          organizationId: organizationIds[0]!,
          firstName: 'Test',
          lastName: 'Driver',
        })
        .returning();
      if (!person) throw new Error('Person fixture failed');
      const [group] = await db
        .insert(registrationGroups)
        .values({
          organizationId: organizationIds[0]!,
          eventId: eventIds[0]!,
          personId: person.id,
        })
        .returning();
      if (!group) throw new Error('Registration group fixture failed');
      groupId = group.id;
      const storage: ObjectStorageProvider = {
        put: async () => {
          throw new Error('unused');
        },
        get: async () => null,
        delete: async (organizationId, objectId) => {
          if (failObjects.has(objectId))
            throw new Error('temporary storage failure');
          deleted.push(`${organizationId}/${objectId}`);
        },
      };
      const workers = createProductWorker({
        db,
        edition: { deploymentMode: 'cloud' },
        storage,
        registrationUploadRetentionDays: 1,
      });
      const handler = workers.taskList.registration_upload_cleanup;
      if (!handler) throw new Error('Cleanup job was not registered');
      task = () => handler({}, { job: { id: crypto.randomUUID() } });
    });

    afterAll(async () => {
      if (!db) return;
      try {
        await db.execute(
          sql`DELETE FROM registration_upload_cleanup WHERE organization_id = ANY(${organizationIds}::uuid[])`,
        );
        await db
          .delete(organizations)
          .where(inArray(organizations.id, organizationIds));
      } finally {
        await close();
      }
    });

    it('keeps bound uploads, scopes object deletes by organization, and retries storage failures', async () => {
      const orphanA = await makeUpload(organizationIds[0]!, eventIds[0]!);
      const orphanB = await makeUpload(organizationIds[1]!, eventIds[1]!);
      const bound = await makeUpload(organizationIds[0]!, eventIds[0]!, true);
      const retry = await makeUpload(organizationIds[0]!, eventIds[0]!);
      failObjects.add(retry);

      await expect(task()).rejects.toThrow('temporary storage failure');
      const remaining = await db.select().from(registrationFormUploads);
      expect(remaining.map((upload) => upload.objectId)).toContain(bound);
      expect(remaining.map((upload) => upload.objectId)).not.toContain(orphanA);
      expect(remaining.map((upload) => upload.objectId)).not.toContain(orphanB);
      const tombstones = await db.execute(sql`
        SELECT organization_id AS "organizationId", object_id AS "objectId"
        FROM registration_upload_cleanup WHERE object_id = ${retry}
      `);
      expect(tombstones.rows).toHaveLength(1);

      failObjects.delete(retry);
      await task();
      const cleared = await db.execute(sql`
        SELECT 1 FROM registration_upload_cleanup WHERE object_id = ${retry}
      `);
      expect(cleared.rows).toHaveLength(0);
      expect(deleted).toContain(`${organizationIds[0]}/${orphanA}`);
      expect(deleted).toContain(`${organizationIds[1]}/${orphanB}`);
      expect(deleted).toContain(`${organizationIds[0]}/${retry}`);
    });

    it('does not race a locked upload being bound by submission on another connection', async () => {
      const candidate = await makeUpload(organizationIds[0]!, eventIds[0]!);
      const second = await createDatabase(databaseUrl ?? '');
      try {
        await second.db.transaction(async (tx) => {
          await tx.execute(sql`
            SELECT id FROM registration_form_upload
            WHERE organization_id = ${organizationIds[0]} AND object_id = ${candidate}
            FOR UPDATE
          `);
          const cleanup = createProductWorker({
            db,
            edition: { deploymentMode: 'cloud' },
            storage: {
              put: async () => {
                throw new Error('unused');
              },
              get: async () => null,
              delete: async (_organizationId, objectId) => {
                deleted.push(objectId);
              },
            },
            registrationUploadRetentionDays: 1,
          }).taskList.registration_upload_cleanup;
          await cleanup!({}, { job: { id: crypto.randomUUID() } });
          await tx.execute(sql`
            UPDATE registration_form_upload SET registration_group_id = ${groupId}
            WHERE organization_id = ${organizationIds[0]} AND object_id = ${candidate}
          `);
        });
        const upload = await db.execute(sql`
          SELECT registration_group_id AS "registrationGroupId"
          FROM registration_form_upload WHERE object_id = ${candidate}
        `);
        expect(upload.rows).toHaveLength(1);
        expect(upload.rows[0]?.registrationGroupId).toBe(groupId);
        expect(deleted).not.toContain(candidate);
      } finally {
        await second.pool.end();
      }
    });
  },
);
