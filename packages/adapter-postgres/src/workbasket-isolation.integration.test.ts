import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { transitionEntry } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createEntryRepository } from './entry-repository.js';
import { createEntryWorkflowRepository } from './entry-workflow.js';
import { createWorkbasketRepository } from './workbasket.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('workbasket admission write isolation', () => {
  it.each(['another organization', 'another event in the same organization'])(
    'does not block writes for %s while a ready admission is paused',
    async (scope) => {
      const { db, pool } = await createDatabase(url!);
      const seed = workbasketSeed(db);
      const suffix = crypto.randomUUID().replaceAll('-', '');
      const trigger = `isolation_pause_${suffix}`;
      const lockKey = Number.parseInt(suffix.slice(0, 7), 16);
      let gate: PoolClient | undefined;
      const admissionUrl = new URL(url!);
      admissionUrl.searchParams.set('application_name', trigger);
      admissionUrl.searchParams.set(
        'options',
        `${admissionUrl.searchParams.get('options') ?? ''} -c statement_timeout=10000`,
      );
      const { db: admissionDb, pool: admissionPool } = await createDatabase(
        admissionUrl.toString(),
      );
      let admissionPid: number | undefined;
      let writer: PoolClient | undefined;
      let admission:
        | Promise<
            { entry: { acceptanceStatus: string } | null } | { error: unknown }
          >
        | undefined;
      try {
        const a = await seed('isolation-a');
        const b = await seed('isolation-b');
        let other = {
          orgId: b.org.id,
          eventId: b.event.id,
          groupId: b.group.id,
          entryId: b.entry.id,
        };
        if (scope === 'another event in the same organization') {
          const event = (
            await pool.query(
              "INSERT INTO event(organization_id,slug,name,starts_on,ends_on) VALUES($1,'other','Other','2030-06-02','2030-06-02') RETURNING id",
              [a.org.id],
            )
          ).rows[0];
          const klass = (
            await pool.query(
              "INSERT INTO event_class(organization_id,event_id,name,code,vehicle_type) VALUES($1,$2,'Other','OTHER','car') RETURNING id",
              [a.org.id, event.id],
            )
          ).rows[0];
          const group = (
            await pool.query(
              'INSERT INTO registration_group(organization_id,event_id,person_id) VALUES($1,$2,$3) RETURNING id',
              [a.org.id, event.id, a.person.id],
            )
          ).rows[0];
          const entry = (
            await pool.query(
              'INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
              [
                a.org.id,
                event.id,
                klass.id,
                group.id,
                a.person.id,
                a.vehicle.id,
                crypto.randomUUID(),
              ],
            )
          ).rows[0];
          other = {
            orgId: a.org.id,
            eventId: event.id,
            groupId: group.id,
            entryId: entry.id,
          };
        }
        await pool.query(
          'UPDATE vehicle SET displacement_cc=1900 WHERE id=$1',
          [a.vehicle.id],
        );
        await pool.query(
          "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
          [a.org.id, a.event.id, a.group.id, crypto.randomUUID()],
        );
        expect(
          (
            await createWorkbasketRepository(db).tasks(a.ctx, a.event.id)
          )?.tasks.some(
            (task) => task.ruleId === 'ready' && task.entryId === a.entry.id,
          ),
        ).toBe(true);

        gate = await pool.connect();
        writer = await pool.connect();
        const gatePid = (await gate.query('SELECT pg_backend_pid() AS pid'))
          .rows[0].pid;
        await writer.query("SET statement_timeout='750ms'");
        await gate.query('SELECT pg_advisory_lock($1,$2)', [741029, lockKey]);
        // Pause the real transition's UPDATE, after readiness has been checked.
        // Only this fixture entry is gated; unrelated UPDATEs run the normal triggers.
        await pool.query(`
          CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            PERFORM pg_advisory_xact_lock(741029, ${lockKey});
            RETURN NEW;
          END
          $$;
          CREATE TRIGGER ${trigger} BEFORE UPDATE ON entry
          FOR EACH ROW WHEN (NEW.id = '${a.entry.id}'::uuid)
          EXECUTE FUNCTION public.${trigger}();
        `);
        admission = transitionEntry(
          { ...a.ctx, permissions: new Set(['entry:write']) },
          a.entry.id,
          'acceptance',
          'accepted',
          'isolation-test',
          'checked',
          {
            entries: createEntryRepository(admissionDb),
            workflows: createEntryWorkflowRepository(admissionDb),
          },
          { eventId: a.event.id },
        ).then(
          (entry) => ({ entry }),
          (error: unknown) => ({ error }),
        );

        // A database-observed wait is the synchronization point, never a sleep.
        let paused = false;
        const deadline = performance.now() + 4000;
        while (performance.now() < deadline) {
          const state = await pool.query(
            `SELECT pid FROM pg_stat_activity
             WHERE application_name=$1 AND state='active'
               AND wait_event_type='Lock' AND wait_event='advisory'
               AND $2 = ANY(pg_blocking_pids(pid))`,
            [trigger, gatePid],
          );
          if (state.rowCount === 1) {
            admissionPid = state.rows[0].pid;
            paused = true;
            break;
          }
        }
        expect(paused, 'admission must reach its gated entry UPDATE').toBe(
          true,
        );

        // Each autocommit statement has its own deadline. Try all three so the
        // regression covers row writers and an INSERT into a readiness predicate.
        // SHARE ROW EXCLUSIVE table barriers make these fail with 57014.
        const writes = [
          {
            name: 'entry',
            sql: 'UPDATE entry SET revision=revision+1 WHERE id=$1 RETURNING id',
            params: [other.entryId],
          },
          {
            name: 'registration group',
            sql: "UPDATE registration_group SET phone='isolation' WHERE id=$1 RETURNING id",
            params: [other.groupId],
          },
          {
            name: 'event document predicate insert',
            sql: "INSERT INTO event_entry_document_type(organization_id,event_id,key,name,required) VALUES($1,$2,'isolation-license','License',true) RETURNING key",
            params: [other.orgId, other.eventId],
          },
        ];
        const outcomes = [];
        for (const write of writes) {
          try {
            const result = await writer.query(write.sql, write.params);
            outcomes.push({ name: write.name, rowCount: result.rowCount });
          } catch (error) {
            outcomes.push({
              name: write.name,
              error: (error as { code?: string }).code ?? String(error),
            });
          }
        }
        expect(outcomes).toEqual(
          writes.map(({ name }) => ({ name, rowCount: 1 })),
        );
        // All writes committed while A still held the gate, not after admission.
        expect(
          (
            await pool.query(
              'SELECT wait_event FROM pg_stat_activity WHERE pid=$1',
              [admissionPid],
            )
          ).rows[0]?.wait_event,
        ).toBe('advisory');
        await gate.query('SELECT pg_advisory_unlock($1,$2)', [741029, lockKey]);
        expect(await admission).toMatchObject({
          entry: { acceptanceStatus: 'accepted' },
        });
        expect(
          (
            await pool.query(
              'SELECT count(*)::int AS n FROM entry_audit_event WHERE entry_id=$1',
              [a.entry.id],
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        // Release the gate and settle the transition before DDL/fixture cleanup,
        // including on timeout/assertion failure; otherwise DROP TRIGGER can hang.
        try {
          if (gate) await gate.query('SELECT pg_advisory_unlock_all()');
          if (admission) await admission;
        } finally {
          gate?.release();
          writer?.release();
          try {
            await admissionPool.end();
            await pool.query(`
              DROP TRIGGER IF EXISTS ${trigger} ON entry;
              DROP FUNCTION IF EXISTS public.${trigger}();
            `);
          } finally {
            try {
              await seed.cleanup();
            } finally {
              await pool.end();
            }
          }
        }
      }
    },
    20000,
  );
});
