import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const migrations = fileURLToPath(new URL('../migrations', import.meta.url));

describe.skipIf(!url)('start-number migration', () => {
  it('confirms only unambiguous valid legacy driver-choice/automatic numbers and preserves every wish', async () => {
    const scratch = `number_migration_${crypto.randomUUID().replaceAll('-', '')}`;
    const admin = new Pool({ connectionString: url! });
    const folder = mkdtempSync(join(tmpdir(), 'number-migrations-'));
    await admin.query(`CREATE DATABASE ${scratch}`);
    const target = new URL(url!);
    target.pathname = `/${scratch}`;
    const pool = new Pool({ connectionString: target.toString() });
    try {
      mkdirSync(join(folder, 'meta'));
      const journal = JSON.parse(
        readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'),
      );
      const previous = journal.entries.filter(
        (entry: { idx: number }) => entry.idx < 40,
      );
      writeFileSync(
        join(folder, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: previous }),
      );
      for (const entry of previous)
        cpSync(
          join(migrations, `${entry.tag}.sql`),
          join(folder, `${entry.tag}.sql`),
        );
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const org = (
        await pool.query(
          "insert into organization (slug,name,timezone,locale) values ('migration','Migration','UTC','de') returning id",
        )
      ).rows[0].id;
      const event = (
        await pool.query(
          "insert into event (organization_id,slug,name,starts_on,ends_on) values ($1,'migration','Migration','2030-01-01','2030-01-02') returning id",
          [org],
        )
      ).rows[0].id;
      const person = (
        await pool.query(
          "insert into person (organization_id,first_name,last_name) values ($1,'Test','Driver') returning id",
          [org],
        )
      ).rows[0].id;
      const vehicle = (
        await pool.query(
          "insert into vehicle (organization_id,make,model) values ($1,'Test','Car') returning id",
          [org],
        )
      ).rows[0].id;
      const group = (
        await pool.query(
          'insert into registration_group (organization_id,event_id,person_id) values ($1,$2,$3) returning id',
          [org, event, person],
        )
      ).rows[0].id;
      const cases = [
        { mode: 'driver_choice', wish: '12', assigned: '12' },
        { mode: 'automatic', wish: '13', assigned: '13' },
        { mode: 'organizer_assigned', wish: '14', assigned: null },
        { mode: 'driver_choice', wish: '100', assigned: null },
        { mode: 'driver_choice', wish: '15', assigned: null },
        { mode: null, wish: 'LEGACY', assigned: 'LEGACY' },
      ];
      const entryIds: string[] = [];
      for (const [index, test] of cases.entries()) {
        const klass = (
          await pool.query(
            "insert into event_class (organization_id,event_id,name,code,vehicle_type) values ($1,$2,$3,$3,'car') returning id",
            [org, event, `Class${index}`],
          )
        ).rows[0].id;
        if (test.mode)
          await pool.query(
            "insert into start_number_range (organization_id,event_id,class_id,range_from,range_to,reserved_numbers,assignment_mode) values ($1,$2,$3,10,20,'{15}',$4)",
            [org, event, klass, test.mode],
          );
        const entry = await pool.query(
          'insert into entry (organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,requested_start_number,orga_code) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
          [
            org,
            event,
            klass,
            group,
            person,
            vehicle,
            test.wish,
            crypto.randomUUID(),
          ],
        );
        entryIds.push(entry.rows[0].id);
      }
      await migrate(drizzle(pool), { migrationsFolder: migrations });
      for (const [index, test] of cases.entries()) {
        const row = (
          await pool.query(
            'select requested_start_number, assigned_start_number from entry where id = $1',
            [entryIds[index]],
          )
        ).rows[0];
        expect(row).toEqual({
          requested_start_number: test.wish,
          assigned_start_number: test.assigned,
        });
      }
    } finally {
      await pool.end();
      // Let the already-ended pool disconnect gracefully. FORCE can race
      // its socket shutdown and emit an uncaught 57P01 on the closing client.
      await admin.query(`DROP DATABASE ${scratch}`);
      await admin.end();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
