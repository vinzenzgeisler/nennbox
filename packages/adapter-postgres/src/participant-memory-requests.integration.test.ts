import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participantMemoryConsentTerms } from '@nennbox/core';
import {
  createDatabase,
  emailOutbox,
  events,
  migrate,
  organizations,
  participantMemoryAccess,
  participantMemoryRequests,
  participantMemorySettings,
} from './index.js';
import {
  adminContext,
  memoryFixture,
  publicContext,
} from './participant-memory-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const version = participantMemoryConsentTerms.version;

/** Link requests (review of #245, P2-1 deadlock, P2-2 timing, P2-5 link lifetimes). */
describe.skipIf(!url)(
  'participant memory: link requests and redemption',
  () => {
    let handle: Awaited<ReturnType<typeof createDatabase>>;
    const orgs: string[] = [];
    const email = 'fahrerin@example.test';
    beforeAll(async () => {
      await migrate(url!);
      handle = await createDatabase(url!);
    }, 60_000);
    afterAll(async () => {
      if (!handle) return;
      try {
        for (const id of orgs) {
          await handle.db.delete(events).where(eq(events.organizationId, id));
          await handle.db.delete(organizations).where(eq(organizations.id, id));
        }
      } finally {
        await handle.pool.end();
      }
    });
    const f = () => memoryFixture(handle.db, orgs);
    const outbox = (org: string) =>
      handle.db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, org));
    const accessRows = (org: string) =>
      handle.db
        .select()
        .from(participantMemoryAccess)
        .where(eq(participantMemoryAccess.organizationId, org));
    const queued = (org: string) =>
      handle.db
        .select()
        .from(participantMemoryRequests)
        .where(eq(participantMemoryRequests.organizationId, org));

    /** Deadlocks PostgreSQL has detected in this database so far (statistics lag by up to a second). */
    const deadlocks = async () => {
      const result = await handle.pool.query(
        'select deadlocks from pg_stat_database where datname = current_database()',
      );
      return Number(result.rows[0].deadlocks);
    };
    /** The SQL a call sends to the database, in order. */
    const statementsOf = async (run: () => Promise<unknown>) => {
      const seen: string[] = [];
      const original = handle.pool.query.bind(handle.pool);
      (handle.pool as { query: unknown }).query = (...args: unknown[]) => {
        const first = args[0] as string | { text: string };
        seen.push(typeof first === 'string' ? first : first.text);
        return (original as (...a: unknown[]) => unknown)(...args);
      };
      try {
        await run();
      } finally {
        (handle.pool as { query: unknown }).query = original;
      }
      return seen;
    };

    it('R7: the request path does the same database work for a known and an unknown address', async () => {
      const fx = f();
      const t = await fx.tenant('Gleich');
      await fx.registration(t, { email });
      const memory = fx.repository();
      await memory.configure(adminContext(t.org.id), { enabled: true });
      const ctx = publicContext(t.org.id);
      const known = await statementsOf(() =>
        memory.requestAccess(ctx, email, 'access', 'de'),
      );
      const unknown = await statementsOf(() =>
        memory.requestAccess(ctx, 'niemand@example.test', 'access', 'de'),
      );
      expect(known.length).toBeGreaterThan(0);
      expect(unknown).toEqual(known);
      // Nothing about the address was looked up or decided yet: one queue row each, no link, no mail.
      expect((await queued(t.org.id)).map((row) => row.email).sort()).toEqual([
        email,
        'niemand@example.test',
      ]);
      expect(await accessRows(t.org.id)).toHaveLength(0);
      expect(await outbox(t.org.id)).toHaveLength(0);
      // The decision is the worker's: only the known address gets a mail, and the queue is empty afterwards.
      expect(await fx.processRequests()).toBe(2);
      expect((await outbox(t.org.id)).map((row) => row.recipient)).toEqual([
        email,
      ]);
      expect(await queued(t.org.id)).toHaveLength(0);
      expect(await accessRows(t.org.id)).toHaveLength(1);
    });

    it('R7: switching the feature off changes nothing about the request path either', async () => {
      const fx = f();
      const t = await fx.tenant('AusGleich');
      await fx.registration(t, { email });
      const memory = fx.repository();
      const ctx = publicContext(t.org.id);
      const off = await statementsOf(() =>
        memory.requestAccess(ctx, email, 'access', 'de'),
      );
      await handle.db.delete(participantMemoryRequests);
      await memory.configure(adminContext(t.org.id), { enabled: true });
      const on = await statementsOf(() =>
        memory.requestAccess(ctx, email, 'access', 'de'),
      );
      expect(off).toEqual(on);
      await handle.db
        .update(participantMemorySettings)
        .set({ enabled: false })
        .where(eq(participantMemorySettings.organizationId, t.org.id));
      await fx.processRequests();
      expect(await outbox(t.org.id)).toHaveLength(0);
      expect(await queued(t.org.id)).toHaveLength(0);
    });

    it('a request for another club is decided in that club only; a repeated request stays one', async () => {
      const fx = f();
      const a = await fx.tenant('QueueA');
      const b = await fx.tenant('QueueB');
      await fx.registration(a, { email });
      const memory = fx.repository();
      await memory.configure(adminContext(a.org.id), { enabled: true });
      await memory.configure(adminContext(b.org.id), { enabled: true });
      await memory.requestAccess(
        publicContext(b.org.id),
        email,
        'access',
        'de',
      );
      await memory.requestAccess(
        publicContext(b.org.id),
        email,
        'access',
        'de',
      );
      expect(await queued(b.org.id)).toHaveLength(1);
      await fx.processRequests();
      expect(await outbox(b.org.id)).toHaveLength(0);
      expect(await accessRows(b.org.id)).toHaveLength(0);
      expect(await outbox(a.org.id)).toHaveLength(0);
    });

    it('link lifetimes: access 30 minutes, delete link 24 hours, session 60 minutes', async () => {
      const fx = f();
      const t = await fx.tenant('Lebensdauer');
      await fx.registration(t, { email });
      const s = await fx.enableAndSignIn(t, email);
      await s.memory.grantConsent(s.ctx, s.identity!, version);
      await s.memory.requestAccess(s.ctx, email, 'delete', 'de');
      await fx.processRequests();
      const minutes = (purpose: string) =>
        accessRows(t.org.id).then((rows) => {
          const row = rows.find((r) => r.purpose === purpose)!;
          return (row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000;
        });
      expect(await minutes('access')).toBeCloseTo(30, 0);
      expect(await minutes('delete')).toBeCloseTo(24 * 60, 0);
      expect(await minutes('session')).toBeCloseTo(60, 0);
    });

    it('a link issued before the feature was switched off opens nothing', async () => {
      const fx = f();
      const t = await fx.tenant('LinkAus');
      await fx.registration(t, { email });
      const memory = fx.repository();
      await memory.configure(adminContext(t.org.id), { enabled: true });
      const ctx = publicContext(t.org.id);
      await memory.requestAccess(ctx, email, 'access', 'de');
      await fx.processRequests();
      const token = (await fx.mailedToken(t.org.id, 'access', email))!;
      await handle.db
        .update(participantMemorySettings)
        .set({ enabled: false })
        .where(eq(participantMemorySettings.organizationId, t.org.id));
      expect(await memory.redeemAccess(ctx, token)).toBeNull();
    });

    it('R8: redeeming a delete link and requesting a new one at the same time never deadlocks', async () => {
      const fx = f();
      const t = await fx.tenant('Verklemmung');
      await fx.registration(t, { email });
      const s = await fx.enableAndSignIn(t, email);
      await s.memory.grantConsent(s.ctx, s.identity!, version);
      await s.memory.requestAccess(s.ctx, email, 'delete', 'de');
      await fx.processRequests();
      const token = (await fx.mailedToken(t.org.id, 'delete', email))!;
      // Age the link so a new request is not throttled, then queue the new request.
      await handle.db
        .update(participantMemoryAccess)
        .set({ createdAt: sql`now() - interval '2 minutes'` })
        .where(eq(participantMemoryAccess.organizationId, t.org.id));
      await s.memory.requestAccess(s.ctx, email, 'delete', 'de');
      // A third connection holds the participant's lock, so both contenders are in flight at once.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const hasLock = new Promise<void>((resolve) => (locked = resolve));
      const holder = handle.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`nennbox.participant-memory:${t.org.id}:${email}`}, 0))`,
        );
        locked();
        await gate;
      });
      await hasLock;
      const deadlocksBefore = await deadlocks();
      const settle = <T>(run: Promise<T>) =>
        run.then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      const request = settle(fx.processRequests());
      await new Promise((resolve) => setTimeout(resolve, 300));
      const redeem = settle(s.memory.redeemDelete(s.ctx, token));
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await holder;
      const [requested, redeemed] = await Promise.all([request, redeem]);
      expect(requested).toMatchObject({ ok: true });
      expect(redeemed).toMatchObject({ ok: true });
      // The retry would hide a lock cycle from the caller; the lock order must prevent it in the first place.
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      expect(await deadlocks()).toBe(deadlocksBefore);
    }, 30_000);

    it('R8: many parallel redemptions, requests and withdrawals of one address never end in an error', async () => {
      const fx = f();
      const t = await fx.tenant('Gedraenge');
      await fx.registration(t, { email });
      const s = await fx.enableAndSignIn(t, email);
      await s.memory.grantConsent(s.ctx, s.identity!, version);
      for (let round = 0; round < 6; round += 1) {
        await handle.db
          .update(participantMemoryAccess)
          .set({ createdAt: sql`now() - interval '2 minutes'` })
          .where(eq(participantMemoryAccess.organizationId, t.org.id));
        await s.memory.requestAccess(s.ctx, email, 'delete', 'de');
        await fx.processRequests();
        const token = await fx.mailedToken(t.org.id, 'delete', email);
        await s.memory.requestAccess(s.ctx, email, 'delete', 'de');
        await handle.db
          .update(participantMemoryAccess)
          .set({ createdAt: sql`now() - interval '2 minutes'` })
          .where(and(eq(participantMemoryAccess.organizationId, t.org.id)));
        const results = await Promise.allSettled([
          fx.processRequests(),
          token ? s.memory.redeemDelete(s.ctx, token) : Promise.resolve(false),
          s.memory.grantConsent(s.ctx, s.identity!, version),
          s.memory.revokeConsent(s.ctx, s.identity!),
          fx.processRequests(),
        ]);
        expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      }
    }, 60_000);
  },
);
