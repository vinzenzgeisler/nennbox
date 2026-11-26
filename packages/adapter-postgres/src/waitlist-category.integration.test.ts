import { describe, expect, it } from 'vitest';
import { defaultEntryWorkflow } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { workbasketSeed } from './workbasket-test-fixture.js';
import {
  offerWaitlistSeat,
  advanceExpiredWaitlistOffers,
} from './waitlist-offer.js';
import { loadWorkbasketSnapshot } from './workbasket-snapshot.js';
import { createWorkbasketRepository } from './workbasket.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('waitlist pinned workflow categories', () => {
  for (const scenario of [
    'rejected',
    'withdrawn',
    'rejected-candidate',
    'unknown',
  ] as const) {
    it(scenario, async () => {
      const { db, pool } = await createDatabase(url!);
      const seed = workbasketSeed(db);
      try {
        const a = await seed(scenario);
        const custom = {
          ...defaultEntryWorkflow,
          statuses: defaultEntryWorkflow.statuses.map((s) => ({
            ...s,
            id: 'custom-' + s.key,
            key: 'display-' + s.key,
          })),
        };
        const revision = (
          await pool.query(
            "INSERT INTO entry_workflow_revision(organization_id,event_id,version,workflow,actor,reason) VALUES($1,$2,2,$3,'test','custom') RETURNING id",
            [a.org.id, a.event.id, JSON.stringify(custom)],
          )
        ).rows[0].id;
        await pool.query(
          'UPDATE event_class SET max_participants=1 WHERE id=$1',
          [a.klass.id],
        );
        await pool.query(
          'INSERT INTO event_waitlist_settings(organization_id,event_id,automatic_promotion,confirmation_hours) VALUES($1,$2,true,48)',
          [a.org.id, a.event.id],
        );
        await pool.query(
          'UPDATE entry SET workflow_revision_id=$1,acceptance_status=$2 WHERE id=$3',
          [
            revision,
            scenario === 'unknown'
              ? 'lost-status'
              : 'custom-' +
                (scenario === 'rejected-candidate' ? 'withdrawn' : scenario),
            a.entry.id,
          ],
        );
        const candidate = (
          await pool.query(
            'INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code,workflow_revision_id,acceptance_status,waitlist_position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1) RETURNING id',
            [
              a.org.id,
              a.event.id,
              a.klass.id,
              a.group.id,
              a.person.id,
              a.vehicle.id,
              crypto.randomUUID(),
              revision,
              scenario === 'rejected-candidate'
                ? 'custom-rejected'
                : 'custom-waitlisted',
            ],
          )
        ).rows[0].id;
        const offer = () =>
          db.transaction((tx) =>
            offerWaitlistSeat({
              tx,
              ctx: a.ctx,
              eventId: a.event.id,
              classId: a.klass.id,
            }),
          );
        if (scenario === 'unknown') {
          await expect(offer()).rejects.toMatchObject({
            cause: expect.objectContaining({
              message: 'Unknown entry status: lost-status',
            }),
          });
          await expect(
            loadWorkbasketSnapshot(db, a.ctx, a.event.id),
          ).rejects.toMatchObject({
            cause: expect.objectContaining({
              message: 'Unknown entry status: lost-status',
            }),
          });
        } else if (scenario === 'rejected-candidate') {
          expect(await offer()).toBeNull();
          // A later real waiter must be found, skipping the rejected entry.
          await pool.query(
            "UPDATE entry SET acceptance_status='custom-waitlisted',waitlist_position=2 WHERE id=$1",
            [a.entry.id],
          );
          expect((await offer())?.entryId).toBe(a.entry.id);
          expect(
            (
              await pool.query(
                'SELECT waitlist_offer_sent_at FROM entry WHERE id=$1',
                [candidate],
              )
            ).rows[0].waitlist_offer_sent_at,
          ).toBeNull();
        } else {
          expect((await offer())?.entryId).toBe(candidate);
          expect(
            await advanceExpiredWaitlistOffers(
              db,
              a.org.id,
              new Date(Date.now() + 49 * 3600000),
            ),
          ).toBe(0);
          expect(
            (
              await pool.query(
                'SELECT waitlist_confirmation_deadline FROM entry WHERE id=$1',
                [candidate],
              )
            ).rows[0].waitlist_confirmation_deadline,
          ).toBeNull();
        }
      } finally {
        await seed.cleanup();
        await pool.end();
      }
    });
  }

  it('bounds unread invalidations without touching another tenant and still rebuilds the cache', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    try {
      const a = await seed('unread'),
        b = await seed('other');
      const repository = createWorkbasketRepository(db);
      expect(await repository.tasks(a.ctx, a.event.id)).not.toBeNull();
      const before = (
        await pool.query(
          'SELECT count(*)::int AS n FROM workbasket_invalidation WHERE organization_id=$1',
          [b.org.id],
        )
      ).rows[0].n;
      for (let n = 0; n < 300; n++)
        await pool.query(
          'UPDATE entry SET revision=revision+1 WHERE organization_id=$1 AND id=$2',
          [a.org.id, a.entry.id],
        );
      const count = (
        await pool.query(
          'SELECT count(*)::int AS n FROM workbasket_invalidation WHERE organization_id=$1 AND event_id=$2',
          [a.org.id, a.event.id],
        )
      ).rows[0].n;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(256);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM workbasket_invalidation WHERE organization_id=$1',
            [b.org.id],
          )
        ).rows[0].n,
      ).toBe(before);
      expect(await repository.tasks(a.ctx, a.event.id)).not.toBeNull();
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM workbasket_invalidation WHERE organization_id=$1 AND event_id=$2',
            [a.org.id, a.event.id],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await seed.cleanup();
      await pool.end();
    }
  });
});
