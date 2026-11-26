import { describe, expect, it } from 'vitest';
import { defaultEntryWorkflow } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('pinned status resolver and number invariants', () => {
  it('ignores raw-key collisions, updates indexes and claims on repinning, and refuses foreign revisions', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    try {
      const a = await seed('number-category'),
        b = await seed('foreign-category');
      const revision = async (version: number, category: string) =>
        (
          await pool.query(
            "INSERT INTO entry_workflow_revision(organization_id,event_id,version,workflow,actor,reason) VALUES($1,$2,$3,$4,'test','category') RETURNING id",
            [
              a.org.id,
              a.event.id,
              version,
              JSON.stringify({
                ...defaultEntryWorkflow,
                statuses: [
                  {
                    id: 'withdrawn',
                    key: 'display',
                    category,
                    labels: { de: 'Eigener Status', en: 'Custom status' },
                  },
                ],
              }),
            ],
          )
        ).rows[0].id;
      const accepted = await revision(2, 'accepted'),
        withdrawn = await revision(3, 'withdrawn');
      await pool.query(
        "UPDATE entry SET workflow_revision_id=$1,acceptance_status='withdrawn',requested_start_number='7',assigned_start_number='7' WHERE id=$2",
        [accepted, a.entry.id],
      );
      expect(
        (
          await pool.query(
            'SELECT entry_status_category($1,$2,$3) AS category',
            [a.org.id, accepted, 'withdrawn'],
          )
        ).rows[0].category,
      ).toBe('accepted');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM entry_start_number_claim WHERE organization_id=$1 AND entry_id=$2',
            [a.org.id, a.entry.id],
          )
        ).rows[0].n,
      ).toBe(1);
      const insert = () =>
        pool.query(
          "INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code,requested_start_number,assigned_start_number) VALUES($1,$2,$3,$4,$5,$6,$7,'7','7')",
          [
            a.org.id,
            a.event.id,
            a.klass.id,
            a.group.id,
            a.person.id,
            a.vehicle.id,
            crypto.randomUUID(),
          ],
        );
      await expect(insert()).rejects.toMatchObject({ code: '23505' });
      // Same raw key, different pinned category must release both indexes and claims.
      await pool.query('UPDATE entry SET workflow_revision_id=$1 WHERE id=$2', [
        withdrawn,
        a.entry.id,
      ]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM entry_start_number_claim WHERE organization_id=$1 AND entry_id=$2',
            [a.org.id, a.entry.id],
          )
        ).rows[0].n,
      ).toBe(0);
      await insert();
      await expect(
        pool.query('SELECT entry_status_category($1,$2,$3)', [
          b.org.id,
          accepted,
          'withdrawn',
        ]),
      ).rejects.toThrow('Unknown entry status: withdrawn');
      await expect(
        pool.query('SELECT entry_status_category($1,$2,$3)', [
          a.org.id,
          accepted,
          'display',
        ]),
      ).rejects.toThrow('Unknown entry status: display');
    } finally {
      await seed.cleanup();
      await pool.end();
    }
  });
});
