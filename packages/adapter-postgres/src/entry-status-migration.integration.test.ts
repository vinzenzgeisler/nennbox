import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { entryWorkflowCategories, releasesPlace } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { seedPaths } from './entry-status-path-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const migration = readFileSync(
  new URL('../migrations/0053_entry_status_categories.sql', import.meta.url),
  'utf8',
);
const preflight = migration
  .split('--> statement-breakpoint')
  .find((statement) => statement.includes('Migration 0053 blocked'))!;

describe.skipIf(!url)('place-holding rule across TypeScript and SQL', () => {
  it('has the same answer for every category in core and in SQL', async () => {
    const { pool } = await createDatabase(url!);
    try {
      for (const category of entryWorkflowCategories)
        expect(
          (
            await pool.query('SELECT entry_category_holds_place($1) AS holds', [
              category,
            ])
          ).rows[0].holds,
          category,
        ).toBe(!releasesPlace(category));
      // Unknown legacy statuses stay reserved, as before.
      expect(
        (await pool.query('SELECT entry_category_holds_place(NULL) AS holds'))
          .rows[0].holds,
      ).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('frees start numbers of rejected and withdrawn entries in indexes and claims', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seedPaths(db, pool, 'number-paths', { max: null });
    try {
      const rejected = await s.addEntry('gone-r', { assigned: '9' });
      const withdrawn = await s.addEntry('gone-w', { requested: '9' });
      const holder = await s.addEntry('ok-1', {
        assigned: '9',
        requested: '9',
      });
      const claims = async (id: string) =>
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM entry_start_number_claim WHERE entry_id=$1',
            [id],
          )
        ).rows[0].n;
      expect([await claims(rejected), await claims(withdrawn)]).toEqual([0, 0]);
      expect(await claims(holder)).toBe(1);
      // Reactivating a released entry whose number was taken meanwhile is refused.
      await expect(
        pool.query("UPDATE entry SET acceptance_status='ok-1' WHERE id=$1", [
          rejected,
        ]),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await s.cleanup();
      await pool.end();
    }
  });
});

describe.skipIf(!url)(
  'migration 0053 preflight for legacy start numbers',
  () => {
    // The preflight is the migration's own statement, run against a table that is
    // temporarily stripped of the new unique indexes (all rolled back).
    const run = async (released: boolean) => {
      const { db, pool } = await createDatabase(url!);
      const s = await seedPaths(db, pool, 'preflight-paths', { max: null });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(
          'DROP INDEX entry_event_assigned_start_number_unique',
        );
        await client.query(
          'DROP INDEX entry_event_requested_start_number_unique',
        );
        await client.query(
          'ALTER TABLE entry DISABLE TRIGGER entry_start_number_claims',
        );
        const insert = (status: string) =>
          client.query(
            `INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code,workflow_revision_id,acceptance_status,assigned_start_number)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'9') RETURNING orga_code`,
            [
              s.org.id,
              s.event.id,
              s.klass.id,
              s.group.id,
              s.person.id,
              s.vehicle.id,
              crypto.randomUUID(),
              s.revision,
              status,
            ],
          );
        const first = (await insert('ok-1')).rows[0].orga_code as string;
        // A custom accepted status literally keyed "withdrawn" was exempt before 0053.
        const second = (await insert(released ? 'gone-r' : 'withdrawn')).rows[0]
          .orga_code as string;
        const outcome = await client.query(preflight).then(
          () => null,
          (error: Error) => error.message,
        );
        return { outcome, first, second, eventId: s.event.id };
      } finally {
        await client.query('ROLLBACK');
        client.release();
        await s.cleanup();
        await pool.end();
      }
    };

    it('names the start number, event and colliding entries', async () => {
      const { outcome, first, second, eventId } = await run(false);
      expect(outcome).toContain('Migration 0053 blocked: start number 9');
      expect(outcome).toContain(`event ${eventId}`);
      expect(outcome).toContain(first);
      expect(outcome).toContain(second);
    });

    it('passes when the second holder is released', async () => {
      expect((await run(true)).outcome).toBeNull();
    });
  },
);
