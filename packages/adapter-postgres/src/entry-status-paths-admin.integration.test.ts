import { describe, expect, it } from 'vitest';
import { staticCanonicalOrigin } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createDriverPortalRepository } from './driver-portal.js';
import { createEntryAdminActionsRepository } from './entry-admin-actions.js';
import { createOverviewRepository } from './event-overview.js';
import { createTimingRepository } from './timing-repository.js';
import { hashPersonalLinkToken } from './personal-link-token.js';
import { seedPaths } from './entry-status-path-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
type Paths = Awaited<ReturnType<typeof seedPaths>>;
type Pool = Awaited<ReturnType<typeof createDatabase>>['pool'];
type Db = Awaited<ReturnType<typeof createDatabase>>['db'];

async function withPaths(
  options: Parameters<typeof seedPaths>[3],
  run: (s: Paths, db: Db, pool: Pool) => Promise<void>,
) {
  const { db, pool } = await createDatabase(url!);
  const s = await seedPaths(db, pool, 'admin-paths', options);
  try {
    await run(s, db, pool);
  } finally {
    await s.cleanup();
    await pool.end();
  }
}

const secondClass = async (s: Paths, pool: Pool, max: number) =>
  (
    await pool.query(
      "INSERT INTO event_class(organization_id,event_id,name,code,vehicle_type,max_participants,max_displacement_cc) VALUES($1,$2,'Second','SEC','car',$3,2000) RETURNING id",
      [s.org.id, s.event.id, max],
    )
  ).rows[0].id as string;

describe.skipIf(!url)('admin class change and overview by category', () => {
  it.each(['gone-r', 'gone-w'])(
    'moving into a class whose only entry is %s is allowed; a held seat is not',
    (released) =>
      withPaths({ max: 5 }, async (s, db, pool) => {
        const target = await secondClass(s, pool, 1);
        const moving = await s.addEntry('ok-1');
        await s.addEntry(released, { classId: target });
        const repository = createEntryAdminActionsRepository(db);
        expect(await repository.availableActions(s.ctx, moving)).toContain(
          `change_class:${target}`,
        );
        await s.addEntry('withdrawn', { classId: target });
        expect(await repository.availableActions(s.ctx, moving)).not.toContain(
          `change_class:${target}`,
        );
        const result = await repository.perform(
          s.ctx,
          moving,
          {
            kind: 'change_class',
            classId: target,
            reason: 'test',
            expectedVersion: (
              await pool.query('SELECT revision FROM entry WHERE id=$1', [
                moving,
              ])
            ).rows[0].revision,
          },
          'office',
        );
        expect(result).toMatchObject({
          status: 'conflict',
          reason: 'capacity',
        });
      }),
  );

  it('allows the move once only released entries remain', () =>
    withPaths({ max: 5 }, async (s, db, pool) => {
      const target = await secondClass(s, pool, 1);
      const moving = await s.addEntry('ok-1');
      await s.addEntry('gone-r', { classId: target });
      const result = await createEntryAdminActionsRepository(db).perform(
        s.ctx,
        moving,
        {
          kind: 'change_class',
          classId: target,
          reason: 'test',
          expectedVersion: (
            await pool.query('SELECT revision FROM entry WHERE id=$1', [moving])
          ).rows[0].revision,
        },
        'office',
      );
      expect(result.status).not.toBe('conflict');
      expect(
        (await pool.query('SELECT class_id FROM entry WHERE id=$1', [moving]))
          .rows[0].class_id,
      ).toBe(target);
    }));

  it('counts only entries that hold a seat in the event overview', () =>
    withPaths({ max: 4 }, async (s, db) => {
      await s.addEntry('ok-1');
      await s.addEntry('pending');
      await s.addEntry('gone-w');
      await s.addEntry('gone-r');
      await s.addEntry('wait-1', { waitlistPosition: 1 });
      await s.addEntry('withdrawn');
      const overview = await createOverviewRepository(db).getEventOverview(
        s.ctx,
        s.event.id,
        new Date('2029-12-31T00:00:00.000Z'),
      );
      expect(overview).toMatchObject({
        ok: true,
        overview: {
          classes: [{ classId: s.klass.id, occupied: 3, capacity: 4 }],
        },
      });
    }));

  it('lists categories for timing and fails loudly on an unknown status', () =>
    withPaths({}, async (s, db, pool) => {
      const open = await s.addEntry('ok-1');
      const timing = createTimingRepository(db);
      const rows = await timing.listEntries(s.ctx, s.event.id);
      expect(rows).toEqual([
        expect.objectContaining({ entryId: open, statusCategory: 'accepted' }),
      ]);
      await pool.query(
        "UPDATE entry SET acceptance_status='lost-status' WHERE id=$1",
        [open],
      );
      await expect(timing.listEntries(s.ctx, s.event.id)).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: 'Unknown entry status: lost-status',
          }),
        },
      );
    }));
});

describe.skipIf(!url)('driver portal follows the pinned category', () => {
  const token = 'p'.repeat(48);
  const portal = (db: Db) =>
    createDriverPortalRepository(
      db,
      staticCanonicalOrigin('https://entries.example.test'),
    );
  const session = (s: Paths, pool: Pool) =>
    pool.query(
      "INSERT INTO driver_portal_session(organization_id,event_id,registration_group_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
      [s.org.id, s.event.id, s.group.id, hashPersonalLinkToken(token)],
    );

  it('keeps access while one entry is active, even if another status is keyed "withdrawn"', () =>
    withPaths({}, async (s, db, pool) => {
      await session(s, pool);
      await s.addEntry('gone-w');
      expect(await portal(db).session(s.ctx, token)).toBeNull();
      await s.addEntry('withdrawn');
      expect(await portal(db).session(s.ctx, token)).not.toBeNull();
    }));

  it('fails loudly instead of granting access for an unknown status', () =>
    withPaths({}, async (s, db, pool) => {
      await session(s, pool);
      const entry = await s.addEntry('ok-1');
      await pool.query(
        "UPDATE entry SET acceptance_status='lost-status' WHERE id=$1",
        [entry],
      );
      await expect(portal(db).session(s.ctx, token)).rejects.toBeTruthy();
    }));

  it('cannot edit or withdraw an entry whose category is already withdrawn', () =>
    withPaths({}, async (s, db, pool) => {
      await session(s, pool);
      await pool.query(
        "INSERT INTO event_driver_portal_field(organization_id,event_id,field_key) VALUES($1,$2,'phone')",
        [s.org.id, s.event.id],
      );
      const gone = await s.addEntry('gone-w2');
      await s.addEntry('ok-1');
      expect(
        await portal(db).update(s.ctx, token, gone, { phone: '12345' }),
      ).toBe(false);
      expect(await portal(db).withdraw(s.ctx, token, gone)).toBe(false);
      expect((await s.row(gone)).status).toBe('gone-w2');
    }));

  it('ends portal access when the last active entry is withdrawn, whatever the withdrawn status is called', () =>
    withPaths({}, async (s, db, pool) => {
      await session(s, pool);
      await pool.query(
        "INSERT INTO event_driver_portal_field(organization_id,event_id,field_key) VALUES($1,$2,'phone')",
        [s.org.id, s.event.id],
      );
      const active = await s.addEntry('ok-1');
      // Another withdrawn status than the one the portal chooses as target.
      await s.addEntry('gone-w2');
      expect(
        await portal(db).update(s.ctx, token, active, { phone: '1' }),
      ).toBe(true);
      expect(await portal(db).withdraw(s.ctx, token, active)).toBe(true);
      expect((await s.row(active)).category).toBe('withdrawn');
      expect(
        (
          await pool.query(
            'SELECT revoked_at FROM driver_portal_session WHERE registration_group_id=$1',
            [s.group.id],
          )
        ).rows[0].revoked_at,
      ).not.toBeNull();
    }));
});
