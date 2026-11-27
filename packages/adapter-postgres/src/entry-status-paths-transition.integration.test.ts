import { describe, expect, it } from 'vitest';
import { createDatabase } from './database-service.js';
import { createEntryTransitionMethod } from './entry-transition-method.js';
import { seedPaths } from './entry-status-path-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

// Every test here goes through the real transition method with a workflow whose
// keys differ from the standard ones (see entry-status-path-fixture.ts).
async function withPaths(
  options: Parameters<typeof seedPaths>[3],
  run: (
    s: Awaited<ReturnType<typeof seedPaths>>,
    transition: (id: string, from: string, to: string) => Promise<unknown>,
    pool: Awaited<ReturnType<typeof createDatabase>>['pool'],
  ) => Promise<void>,
) {
  const { db, pool } = await createDatabase(url!);
  const s = await seedPaths(db, pool, 'paths', options);
  const method = createEntryTransitionMethod(db);
  try {
    await run(
      s,
      (id, from, to) =>
        method.transition(s.ctx, id, 'acceptance', from, to, 'office', 'test'),
      pool,
    );
  } finally {
    await s.cleanup();
    await pool.end();
  }
}

describe.skipIf(!url)('transitions use the pinned status category', () => {
  it.each(['gone-w', 'gone-r'])(
    'a transition into %s frees the seat and offers it to the first waiter',
    (target) =>
      withPaths({}, async (s, transition) => {
        const holder = await s.addEntry('ok-1');
        const first = await s.addEntry('wait-1', { waitlistPosition: 1 });
        const second = await s.addEntry('wait-1', { waitlistPosition: 2 });
        await transition(holder, 'ok-1', target);
        expect((await s.row(first)).offered).not.toBeNull();
        expect((await s.row(second)).offered).toBeNull();
      }),
  );

  it.each(['withdrawn', 'rejected'])(
    'a status keyed "%s" with category accepted keeps its seat',
    (decoy) =>
      // Unlimited class: a wrongly released seat would be offered at once.
      withPaths({ max: null }, async (s, transition) => {
        const holder = await s.addEntry('ok-1');
        const waiter = await s.addEntry('wait-1', { waitlistPosition: 1 });
        await transition(holder, 'ok-1', decoy);
        expect((await s.row(waiter)).offered).toBeNull();
      }),
  );

  it('does not trigger waitlist promotion when the class has no waiting status', () =>
    withPaths({ waitlist: false }, async (s, transition) => {
      const holder = await s.addEntry('ok-1');
      await expect(transition(holder, 'ok-1', 'gone-r')).resolves.toBeTruthy();
    }));

  it('reactivating into a full class re-queues the entry at the tail', () =>
    withPaths({}, async (s, transition, pool) => {
      const gone = await s.addEntry('gone-r');
      await s.addEntry('ok-1');
      await s.addEntry('wait-1', { waitlistPosition: 4 });
      const moved = (await transition(gone, 'gone-r', 'ok-1')) as {
        acceptanceStatus: string;
      };
      expect(moved.acceptanceStatus).toBe('wait-1');
      expect(await s.row(gone)).toMatchObject({
        status: 'wait-1',
        category: 'waitlisted',
        position: 5,
      });
      const audit = await pool.query(
        'SELECT from_status,to_status,actor,reason FROM entry_audit_event WHERE entry_id=$1 ORDER BY actor',
        [gone],
      );
      expect(audit.rows).toEqual([
        {
          from_status: 'gone-r',
          to_status: 'ok-1',
          actor: 'office',
          reason: 'test',
        },
        {
          from_status: 'ok-1',
          to_status: 'wait-1',
          actor: 'system',
          reason: 'class_full_reactivated_to_waitlist',
        },
      ]);
    }));

  it('re-queues a reactivated withdrawn entry too, also when it returns as pending', () =>
    withPaths({}, async (s, transition) => {
      const gone = await s.addEntry('gone-w');
      await s.addEntry('ok-1');
      await transition(gone, 'gone-w', 'pending');
      expect(await s.row(gone)).toMatchObject({
        status: 'wait-1',
        category: 'waitlisted',
      });
    }));

  it('reactivates normally while a seat is free, and a waiting offer holds its seat', () =>
    withPaths({ max: 2 }, async (s, transition, pool) => {
      const gone = await s.addEntry('gone-r');
      const second = await s.addEntry('gone-w');
      await s.addEntry('ok-1');
      await transition(gone, 'gone-r', 'ok-1');
      expect((await s.row(gone)).status).toBe('ok-1');
      // The last seat is promised to a waiter: no overbooking by the reactivated entry.
      const offered = await s.addEntry('wait-1', { waitlistPosition: 1 });
      await pool.query(
        "UPDATE entry SET waitlist_offer_sent_at=now(),waitlist_confirmation_deadline=now()+interval '1 day' WHERE id=$1",
        [offered],
      );
      await transition(second, 'gone-w', 'ok-1');
      expect((await s.row(second)).status).toBe('wait-1');
    }));

  it('refuses reactivation into a full class when the workflow has no waiting status', () =>
    withPaths({ waitlist: false }, async (s, transition) => {
      const gone = await s.addEntry('gone-r');
      await s.addEntry('ok-1');
      await expect(transition(gone, 'gone-r', 'ok-1')).rejects.toMatchObject({
        message: 'class_full_no_waitlist',
      });
      expect((await s.row(gone)).status).toBe('gone-r');
    }));

  it('ignores a transition from a decoy status when deciding on reactivation', () =>
    withPaths({}, async (s, transition) => {
      const decoy = await s.addEntry('withdrawn');
      await s.addEntry('ok-1');
      await transition(decoy, 'withdrawn', 'ok-1');
      expect((await s.row(decoy)).status).toBe('ok-1');
    }));
});
