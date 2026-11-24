import { describe, it, expect } from 'vitest';
import { defaultEntryWorkflow } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createWorkbasketRepository } from './workbasket.js';
import { loadWorkbasketSnapshot } from './workbasket-snapshot.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('workbasket review regressions', () => {
  it('resolves every standard and custom category from the pinned tenant workflow, not the current revision or display key', async () => {
    const { db, pool } = await createDatabase(url!);
    try {
      const a = await workbasketSeed(db)('workflow');
      const repo = createWorkbasketRepository(db);
      await pool.query('UPDATE vehicle SET displacement_cc=1900 WHERE id=$1', [
        a.vehicle.id,
      ]);
      await pool.query(
        "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
        [a.org.id, a.event.id, a.group.id, crypto.randomUUID()],
      );
      const custom = {
        ...defaultEntryWorkflow,
        statuses: defaultEntryWorkflow.statuses.map((s) => ({
          ...s,
          id: 'custom-' + s.key,
          key: 'label-' + s.key,
        })),
      };
      const revision = (
        await pool.query(
          "INSERT INTO entry_workflow_revision(organization_id,event_id,version,workflow,actor,reason) VALUES($1,$2,2,$3,'test','custom statuses') RETURNING id",
          [a.org.id, a.event.id, JSON.stringify(custom)],
        )
      ).rows[0].id;
      const legacyCustom = {
        ...defaultEntryWorkflow,
        statuses: defaultEntryWorkflow.statuses.map((s) => ({
          ...s,
          key: 'legacy-' + s.key,
        })),
      };
      const legacyRevision = (
        await pool.query(
          "INSERT INTO entry_workflow_revision(organization_id,event_id,version,workflow,actor,reason) VALUES($1,$2,3,$3,'test','legacy custom keys') RETURNING id",
          [a.org.id, a.event.id, JSON.stringify(legacyCustom)],
        )
      ).rows[0].id;
      const standard = a.entry.workflowRevisionId;
      for (const [revisionId, statuses] of [
        [standard, defaultEntryWorkflow.statuses],
        [revision, custom.statuses],
        [legacyRevision, legacyCustom.statuses],
      ] as const) {
        for (const status of statuses) {
          const key = status.id ?? status.key;
          await pool.query(
            'UPDATE entry SET workflow_revision_id=$1,acceptance_status=$2 WHERE id=$3',
            [revisionId, key, a.entry.id],
          );
          const snapshot = await loadWorkbasketSnapshot(db, a.ctx, a.event.id);
          expect(snapshot.entries[0]?.status).toBe(status.category);
          expect(snapshot.entries[0]?.statusKey).toBe(key);
          const tasks = (await repo.tasks(a.ctx, a.event.id))!.tasks.filter(
            (t) => t.entryId === a.entry.id,
          );
          expect(tasks.some((t) => t.ruleId === 'ready')).toBe(
            status.category === 'pending',
          );
          expect(tasks.some((t) => t.ruleId === 'waitlistPromotion')).toBe(
            status.category === 'waitlisted',
          );
          if (['rejected', 'withdrawn'].includes(status.category))
            expect(tasks).toEqual([]);
        }
      }
    } finally {
      await pool.end();
    }
  });

  it('allows another entry writer to finish before the first writer touches that entry', async () => {
    const { db, pool } = await createDatabase(url!);
    const a = await pool.connect(),
      b = await pool.connect();
    try {
      const seed = await workbasketSeed(db)('concurrency');
      const other = (
        await pool.query(
          'INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code) SELECT organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,$2 FROM entry WHERE id=$1 RETURNING id',
          [seed.entry.id, crypto.randomUUID()],
        )
      ).rows[0].id;
      const repo = createWorkbasketRepository(db);
      const before = (await repo.tasks(seed.ctx, seed.event.id))!;
      await a.query('BEGIN');
      await b.query('BEGIN');
      // A holds X. B must be able to commit Y without waiting on A's event cache.
      // A's subsequent Y update models withdrawal + automatic waitlist promotion.
      await a.query("SET LOCAL statement_timeout='3000ms'");
      await b.query("SET LOCAL statement_timeout='3000ms'");
      await a.query("SET LOCAL deadlock_timeout='100ms'");
      await b.query("SET LOCAL deadlock_timeout='100ms'");
      await a.query('UPDATE entry SET revision=revision+1 WHERE id=$1', [
        seed.entry.id,
      ]);
      let finished = false;
      const writerB = b
        .query('UPDATE entry SET revision=revision+1 WHERE id=$1', [other])
        .then(async () => {
          await b.query('COMMIT');
          return { ok: true, code: null };
        })
        .catch(async (error: { code: string }) => {
          await b.query('ROLLBACK');
          return { ok: false, code: error.code };
        })
        .finally(() => {
          finished = true;
        });
      // Establish B's row ownership (or successful commit) before A requests Y.
      // The old trigger is observed waiting on transactionid, then creates 40P01.
      let observed = false;
      const deadline = performance.now() + 2000;
      while (!finished && performance.now() < deadline) {
        const state = await pool.query(
          'SELECT wait_event FROM pg_stat_activity WHERE pid=$1',
          [b.processID],
        );
        if (state.rows[0]?.wait_event === 'transactionid') {
          observed = true;
          break;
        }
      }
      observed ||= finished;
      const writerA = await a
        .query('UPDATE entry SET revision=revision+1 WHERE id=$1', [other])
        .then(() => ({ ok: true, code: null }))
        .catch(async (error: { code: string }) => {
          await a.query('ROLLBACK');
          return { ok: false, code: error.code };
        });
      const resultB = await writerB;
      expect(observed).toBe(true);
      expect([writerA, resultB]).toEqual([
        { ok: true, code: null },
        { ok: true, code: null },
      ]);
      // Reading while A is still open must neither wait for A nor consume A's signal.
      const during = (await repo.tasks(seed.ctx, seed.event.id))!;
      expect(during.generation).toBe(before.generation + 1);
      await a.query('COMMIT');
      expect((await repo.tasks(seed.ctx, seed.event.id))!.generation).toBe(
        during.generation + 1,
      );
      expect((await repo.tasks(seed.ctx, seed.event.id))!.generation).toBe(
        during.generation + 1,
      );
    } finally {
      await a.query('ROLLBACK');
      await b.query('ROLLBACK');
      a.release();
      b.release();
      await pool.end();
    }
  });

  it('restores drained invalidations if projection fails', async () => {
    const { db, pool } = await createDatabase(url!);
    try {
      const a = await workbasketSeed(db)('rollback');
      const repo = createWorkbasketRepository(db);
      const before = (await repo.tasks(a.ctx, a.event.id))!;
      await pool.query(
        'INSERT INTO workbasket_configuration(organization_id,scope_id,event_id,config) VALUES($1,$2,$2,$3)',
        [a.org.id, a.event.id, JSON.stringify({ ready: { enabled: 'bad' } })],
      );
      await expect(repo.tasks(a.ctx, a.event.id)).rejects.toThrow();
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM workbasket_invalidation WHERE event_id=$1',
            [a.event.id],
          )
        ).rows[0].n,
      ).toBeGreaterThan(0);
      expect(
        (
          await pool.query(
            'SELECT generation FROM workbasket_cache WHERE event_id=$1',
            [a.event.id],
          )
        ).rows[0].generation,
      ).toBe(before.generation);
      await pool.query(
        "UPDATE workbasket_configuration SET config='{}' WHERE event_id=$1",
        [a.event.id],
      );
      expect((await repo.tasks(a.ctx, a.event.id))!.generation).toBe(
        before.generation + 1,
      );
    } finally {
      await pool.end();
    }
  });
});
