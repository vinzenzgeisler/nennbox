import { eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createRequestContext,
  organizationId,
  settleCancellationRefund,
} from '@nennbox/core';
import type { PaymentProvider, PaymentProviderEvent } from '@nennbox/core';
import { createEntryTransitionMethod } from './entry-transition-method.js';
import { createEntryAdminActionsRepository } from './entry-admin-actions.js';
import { RefundRejectedError, MAX_REFUND_ATTEMPTS } from '@nennbox/core';
import { createDatabase, migrate } from './database-service.js';
import { createCheckoutRepository } from './payment-checkouts.js';
import { createPaymentRefundRepository } from './payment-refunds.js';
import {
  createRefundIntentRepository,
  openRefundIntent,
} from './payment-refund-intents.js';
import { loadInvoiceSummaries } from './entry-admin-invoice.js';
import {
  entries,
  eventClasses,
  events,
  invoices,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';
import {
  paymentRefundIntents,
  paymentRefundReservations,
} from './schema/provider-payments.js';
import { emailOutbox } from './mail-schema.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

// One migration for every describe below; none of them depends on another one having run.
beforeAll(async () => {
  if (!url) return;
  await migrate(url);
  await runMigrations({ connectionString: url });
});

async function cleanup(
  db: Awaited<ReturnType<typeof createDatabase>>['db'],
  ...organizationIds: string[]
) {
  await db
    .delete(emailOutbox)
    .where(inArray(emailOutbox.organizationId, organizationIds));
  await db
    .delete(events)
    .where(inArray(events.organizationId, organizationIds));
  await db
    .delete(organizations)
    .where(inArray(organizations.id, organizationIds));
}

async function seed(
  db: Awaited<ReturnType<typeof createDatabase>>['db'],
  label: string,
  options: {
    totalCents?: number;
    orgConfig?: Record<string, unknown>;
    eventConfig?: Record<string, unknown>;
    startsOn?: string;
    entryCount?: number;
  } = {},
) {
  const suffix = crypto.randomUUID();
  const [org] = await db
    .insert(organizations)
    .values({
      slug: `pay-${label}-${suffix}`,
      name: `Payment ${label}`,
      timezone: 'UTC',
      locale: 'de',
      currency: 'EUR',
      registrationFormConfig: options.orgConfig ?? null,
    })
    .returning();
  const [event] = await db
    .insert(events)
    .values({
      organizationId: org!.id,
      slug: `event-${suffix}`,
      name: 'Bergpreis',
      startsOn: options.startsOn ?? '2030-06-15',
      endsOn: options.startsOn ?? '2030-06-15',
      status: 'open',
      registrationFormConfig: options.eventConfig ?? null,
    })
    .returning();
  const [klass] = await db
    .insert(eventClasses)
    .values({
      organizationId: org!.id,
      eventId: event!.id,
      name: 'Touring',
      code: 'TOUR',
      vehicleType: 'car',
    })
    .returning();
  const [person] = await db
    .insert(people)
    .values({
      organizationId: org!.id,
      firstName: 'Ada',
      lastName: 'Driver',
      email: `ada-${suffix}@example.test`,
    })
    .returning();
  const [vehicle] = await db
    .insert(vehicles)
    .values({ organizationId: org!.id, make: 'Honda', model: 'RS' })
    .returning();
  const [group] = await db
    .insert(registrationGroups)
    .values({
      organizationId: org!.id,
      eventId: event!.id,
      personId: person!.id,
    })
    .returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: org!.id,
      eventId: event!.id,
      registrationGroupId: group!.id,
      totalCents: options.totalCents ?? 4200,
      currency: 'EUR',
      paymentReference: `PAY-${suffix}`,
    })
    .returning();
  const entryRows = [];
  for (let index = 0; index < (options.entryCount ?? 1); index += 1) {
    const [entry] = await db
      .insert(entries)
      .values({
        orgaCode: `PAY-${crypto.randomUUID()}`,
        organizationId: org!.id,
        eventId: event!.id,
        classId: klass!.id,
        registrationGroupId: group!.id,
        driverPersonId: person!.id,
        vehicleId: vehicle!.id,
      })
      .returning();
    entryRows.push(entry!);
  }
  const ctx = createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(org!.id),
    permissions: new Set(['payment:write', 'entry:read']),
    capabilities: new Set(),
    correlationId: suffix,
  });
  return {
    suffix,
    org: org!,
    event: event!,
    group: group!,
    invoice: invoice!,
    entries: entryRows,
    ctx,
  };
}

const paid = (
  s: Awaited<ReturnType<typeof seed>>,
  overrides: Partial<Extract<PaymentProviderEvent, { type: 'succeeded' }>> = {},
): PaymentProviderEvent => ({
  id: `evt-paid-${crypto.randomUUID()}`,
  organizationId: organizationId(s.org.id),
  invoiceId: s.invoice.id,
  sessionId: `cs-${s.suffix}`,
  type: 'succeeded',
  amountCents: 4200,
  currency: 'eur',
  paymentId: `pi-${s.suffix}`,
  ...overrides,
});

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type Seed = Awaited<ReturnType<typeof seed>>;
type Pool = Awaited<ReturnType<typeof createDatabase>>['pool'];
type ProviderCall = Parameters<PaymentProvider['refund']>[0];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

const reject = async (db: Db, s: Seed, id = s.entries[0]!.id) => {
  await db.transaction(async (tx) => {
    await tx
      .update(entries)
      .set({ acceptanceStatus: 'rejected' })
      .where(eq(entries.id, id));
    await openRefundIntent(tx, s.org.id, id, 'rejected');
  });
};
const reactivate = (db: Db, s: Seed, from = 'rejected') =>
  createEntryTransitionMethod(db).transition(
    s.ctx,
    s.entries[0]!.id,
    'acceptance',
    from,
    'pending',
    'office',
    'reopen',
  );
const provider = (
  calls: ProviderCall[],
  impl?: (request: ProviderCall) => Promise<{ id: string }>,
) =>
  ({
    refund: async (request: ProviderCall) => {
      calls.push(request);
      if (impl) return impl(request);
      return { id: `re-${calls.length}-${crypto.randomUUID()}` };
    },
  }) as unknown as PaymentProvider;
const cfg = (pct: number) => ({
  payments: {
    refundPolicy: { enabled: true, tiers: [], rejectedPercent: pct },
  },
});
const manual = (
  s: Seed,
  providerPaymentId: string,
  amountCents: number,
  key: string = crypto.randomUUID(),
) => ({
  invoiceId: s.invoice.id,
  providerPaymentId,
  idempotencyKey: key,
  source: {
    kind: 'manual' as const,
    amountCents,
    actor: 'office',
    reason: 'Kulanz',
  },
});
const piOf = (s: Seed) => `pi-${s.suffix}`;
const settle = (
  db: Db,
  s: Seed,
  calls: ProviderCall[],
  impl?: Parameters<typeof provider>[1],
) =>
  settleCancellationRefund(s.ctx, s.invoice.id, {
    intents: createRefundIntentRepository(db),
    refunds: createPaymentRefundRepository(db),
    provider: provider(calls, impl),
  });
const ledgerSum = async (db: Db, s: Seed, providerPaymentId?: string) =>
  Number(
    rowsOf<{ n: number }>(
      await db.execute(
        sql`select coalesce(sum(amount_cents), 0)::int as n from invoice_payment where invoice_id = ${s.invoice.id} ${providerPaymentId ? sql`and provider_payment_id = ${providerPaymentId}` : sql``}`,
      ),
    )[0]!.n,
  );

/**
 * Holds the invoice row lock on another connection, starts `operation` and
 * proves that it waits for the lock instead of running past it. Without its
 * own `FOR UPDATE` the operation finishes while the lock is still held.
 */
async function waitsForInvoiceLock<T>(
  pool: Pool,
  s: Seed,
  operation: () => Promise<T>,
): Promise<T> {
  const holder = await pool.connect();
  let released = false;
  try {
    await holder.query('begin');
    await holder.query('select id from invoice where id = $1 for update', [
      s.invoice.id,
    ]);
    let settled = false;
    const running = operation().finally(() => {
      settled = true;
    });
    running.catch(() => undefined);
    let waiting = false;
    for (let attempt = 0; attempt < 60 && !waiting && !settled; attempt += 1) {
      // Not the holder's connection: inside its transaction the activity view is a stale snapshot.
      const { rows } = await pool.query(
        `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
      );
      waiting = Number(rows[0].n) > 0;
      if (!waiting) await sleep(50);
    }
    const finishedWhileLocked = settled;
    await holder.query('commit');
    released = true;
    const result = await running;
    expect(waiting, 'the operation must wait for the invoice row lock').toBe(
      true,
    );
    expect(finishedWhileLocked).toBe(false);
    return result;
  } finally {
    if (!released) await holder.query('rollback').catch(() => undefined);
    holder.release();
  }
}

describe.skipIf(!url)('second review: original findings stay closed', () => {
  it('does not refund a registration reactivated by a direct database update', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'r1', { orgConfig: cfg(100) });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await reject(db, s);
      await db
        .update(entries)
        .set({ acceptanceStatus: 'pending' })
        .where(eq(entries.id, s.entries[0]!.id));
      const calls: ProviderCall[] = [];
      const result = await settle(db, s, calls);
      expect(result).toMatchObject({
        status: 'skipped',
        failure: 'registration_reactivated',
      });
      expect(calls).toHaveLength(0);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('invalidates the intent when the productive transition reactivates the registration', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'r1b', { orgConfig: cfg(100) });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await reject(db, s);
      await reactivate(db, s);
      const [intent] = await db
        .select()
        .from(paymentRefundIntents)
        .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
      expect(intent).toMatchObject({
        status: 'skipped',
        failure: 'registration_reactivated',
      });
      const calls: ProviderCall[] = [];
      await settle(db, s, calls);
      expect(calls).toHaveLength(0);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('refuses a reactivation while the provider call is in flight', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'r1c', { orgConfig: cfg(100) });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await reject(db, s);
      let failure: unknown = null;
      const calls: ProviderCall[] = [];
      await settle(db, s, calls, async () => {
        failure = await reactivate(db, s).then(
          () => null,
          (error: unknown) => error,
        );
        return { id: 're-inflight' };
      });
      expect((failure as Error).message).toBe('refund_in_progress');
      expect(calls).toHaveLength(1);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('subtracts a manual refund that was booked between claim and settlement', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'r2', { orgConfig: cfg(50) });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await reject(db, s);
      const refunds = createPaymentRefundRepository(db);
      const intents = createRefundIntentRepository(db);
      const originalClaim = intents.claim;
      intents.claim = async (ctx, id) => {
        const snapshot = await originalClaim(ctx, id);
        await refunds.recordRefund(ctx, {
          invoiceId: id,
          providerPaymentId: piOf(s),
          providerRefundId: `re-manual-${s.suffix}`,
          amountCents: 2100,
          currency: 'EUR',
          refundableCents: 4200,
          actor: 'office',
          reason: 'manual share',
        });
        return snapshot;
      };
      const calls: ProviderCall[] = [];
      await settleCancellationRefund(s.ctx, s.invoice.id, {
        intents,
        refunds,
        provider: provider(calls),
      });
      expect(calls).toHaveLength(0);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('blocks a manual reservation while the automatic provider call runs, and the automatic share shrinks by an earlier manual one', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'r2b', { orgConfig: cfg(50) });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await reject(db, s);
      const refunds = createPaymentRefundRepository(db);
      let during: unknown = null;
      await settle(db, s, [], async () => {
        during = await refunds.reserve(s.ctx, manual(s, piOf(s), 4200));
        return { id: 're-auto' };
      });
      expect(during).toMatchObject({
        status: 'unavailable',
        reason: 'exceeds_available',
        availableCents: 2100,
      });
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('lets an earlier manual refund count against the automatic share, never above it', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'r2c', { orgConfig: cfg(50) });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await reject(db, s);
      const refunds = createPaymentRefundRepository(db);
      expect(
        (await refunds.reserve(s.ctx, manual(s, piOf(s), 1000))).status,
      ).toBe('reserved');
      const calls: ProviderCall[] = [];
      await settle(db, s, calls);
      // 50 % of 42,00 is 21,00; 10,00 are already reserved by hand.
      expect(calls.map((call) => call.amountCents)).toEqual([1100]);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
});

describe.skipIf(!url)(
  'manual refunds follow what was collected, not the rule (P1-A)',
  () => {
    it('refunds a payment after the cancellation in full under an active 50 % rule', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'late50', { orgConfig: cfg(50) });
      try {
        const checkouts = createCheckoutRepository(db);
        const refunds = createPaymentRefundRepository(db);
        await checkouts.applyProviderEvent(paid(s));
        await reject(db, s);
        const calls: ProviderCall[] = [];
        await settle(db, s, calls);
        expect(calls.map((call) => call.amountCents)).toEqual([2100]);
        const late = `pi-late-${s.suffix}`;
        await checkouts.applyProviderEvent(
          paid(s, { paymentId: late, sessionId: `cs-late-${s.suffix}` }),
        );
        const [lateIntent] = await db
          .select()
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
        expect(lateIntent).toMatchObject({
          trigger: 'late_payment',
          status: 'failed',
          failure: 'payment_after_cancellation',
        });
        const full = await refunds.reserve(s.ctx, manual(s, late, 4200));
        expect(full).toMatchObject({ status: 'reserved', amountCents: 4200 });
        // The whole collected amount is reserved now; nothing more can be claimed.
        expect(await refunds.reserve(s.ctx, manual(s, late, 1))).toEqual({
          status: 'unavailable',
          reason: 'exceeds_available',
          availableCents: 0,
        });
        if (full.status !== 'reserved') throw new Error('unreachable');
        await refunds.recordRefund(s.ctx, {
          invoiceId: s.invoice.id,
          providerPaymentId: late,
          refundableCents: 4200,
          currency: 'EUR',
          amountCents: 4200,
          providerRefundId: `re-late-${s.suffix}`,
          actor: 'office',
          reason: 'late payment',
          reservationKey: full.idempotencyKey,
        });
        expect(await ledgerSum(db, s, late)).toBe(0);
        // Nothing may ever leave more than was collected, per payment and in total.
        expect(await ledgerSum(db, s, piOf(s))).toBe(2100);
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 2101)),
        ).toMatchObject({
          status: 'unavailable',
          reason: 'exceeds_available',
          availableCents: 2100,
        });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('allows goodwill refunds under a 0 % rule up to what was collected', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'zero', { orgConfig: cfg(0) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        const calls: ProviderCall[] = [];
        expect(await settle(db, s, calls)).toMatchObject({ status: 'skipped' });
        expect(calls).toHaveLength(0);
        const refunds = createPaymentRefundRepository(db);
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 1000)),
        ).toMatchObject({ status: 'reserved', amountCents: 1000 });
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 3200)),
        ).toMatchObject({ status: 'reserved', amountCents: 3200 });
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 1)),
        ).toMatchObject({
          status: 'unavailable',
          reason: 'exceeds_available',
        });
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 0)),
        ).toMatchObject({
          status: 'unavailable',
          reason: 'invalid_amount',
        });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('never exceeds what was collected, automatically, manually or in sum', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'sum', { orgConfig: cfg(100) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        const refunds = createPaymentRefundRepository(db);
        const calls: ProviderCall[] = [];
        await settle(db, s, calls);
        expect(calls.map((call) => call.amountCents)).toEqual([4200]);
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 1)),
        ).toMatchObject({
          status: 'unavailable',
          reason: 'exceeds_available',
          availableCents: 0,
        });
        expect(await ledgerSum(db, s)).toBe(0);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('marks a payment after the cancellation with its own trigger and never refunds it automatically', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'late-trigger', { orgConfig: cfg(100) });
      try {
        // Cancelled before any money arrived: no intent exists yet.
        await db
          .update(entries)
          .set({ acceptanceStatus: 'withdrawn' })
          .where(eq(entries.id, s.entries[0]!.id));
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const [intent] = await db
          .select()
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
        expect(intent).toMatchObject({
          trigger: 'late_payment',
          status: 'failed',
          failure: 'payment_after_cancellation',
        });
        await db
          .update(paymentRefundIntents)
          .set({ updatedAt: new Date(0), createdAt: new Date(0) })
          .where(eq(paymentRefundIntents.id, intent!.id));
        const calls: ProviderCall[] = [];
        expect(await settle(db, s, calls)).toBeNull();
        expect(calls).toHaveLength(0);
        expect(
          await createRefundIntentRepository(db).staleInvoiceIds(s.ctx),
        ).not.toContain(s.invoice.id);
        // Even a waiting intent of this kind is never taken by the automatic refund.
        await db
          .update(paymentRefundIntents)
          .set({ status: 'pending' })
          .where(eq(paymentRefundIntents.id, intent!.id));
        expect(await settle(db, s, calls)).toBeNull();
        expect(calls).toHaveLength(0);
        expect(
          await createRefundIntentRepository(db).staleInvoiceIds(s.ctx),
        ).not.toContain(s.invoice.id);
        expect(
          await createPaymentRefundRepository(db).reserve(
            s.ctx,
            manual(s, piOf(s), 4200),
          ),
        ).toMatchObject({ status: 'reserved', amountCents: 4200 });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
  },
);

describe.skipIf(!url)('lock order and deadlocks (P2-A)', () => {
  /** Slows the audit insert of the amount action: it runs while the action holds its first locks. */
  async function slowAmountAction(db: Db, s: Seed, run: () => Promise<void>) {
    const name = `nb_slow_${s.suffix.replaceAll('-', '')}`;
    await db.execute(
      sql.raw(
        `create function ${name}() returns trigger language plpgsql as $$ begin perform pg_sleep(1.2); return new; end $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `create trigger ${name} before insert on entry_admin_action_audit_event for each row when (new.organization_id = '${s.org.id}') execute function ${name}()`,
      ),
    );
    try {
      await run();
    } finally {
      await db.execute(
        sql.raw(
          `drop trigger if exists ${name} on entry_admin_action_audit_event`,
        ),
      );
      await db.execute(sql.raw(`drop function if exists ${name}()`));
    }
  }
  const snapshot = {
    version: '1',
    currency: 'EUR',
    calculatedAt: new Date().toISOString(),
    totalCents: 4200,
    lines: [],
  } as const;
  async function pricedEntry(db: Db, s: Seed) {
    await db
      .update(entries)
      .set({ priceSnapshot: snapshot })
      .where(eq(entries.id, s.entries[0]!.id));
  }
  async function untilSleeping(pool: Pool) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await pool.query(
        `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event = 'PgSleep'`,
      );
      if (Number(rows[0].n) > 0) return;
      await sleep(25);
    }
    throw new Error('the amount action never reached the slowed insert');
  }
  const amountAction = (db: Db, s: Seed) =>
    createEntryAdminActionsRepository(db).perform(
      s.ctx,
      s.entries[0]!.id,
      {
        kind: 'adjust_amount',
        amountCents: 3000,
        reason: 'x',
        expectedVersion: 1,
      },
      'office',
    );

  it('the amount action holds the invoice before it touches the entry rows', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'order', { orgConfig: cfg(100) });
    try {
      await pricedEntry(db, s);
      await slowAmountAction(db, s, async () => {
        const running = amountAction(db, s);
        await untilSleeping(pool);
        // The action has locked the entry rows by now. It must hold the invoice already.
        await expect(
          pool.query('select id from invoice where id = $1 for update nowait', [
            s.invoice.id,
          ]),
        ).rejects.toMatchObject({ code: '55P03' });
        expect(await running).toEqual({ status: 'updated' });
      });
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('an acceptance transition during an amount change waits and succeeds without a database error', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'deadlock', { orgConfig: cfg(100) });
    try {
      await pricedEntry(db, s);
      await slowAmountAction(db, s, async () => {
        const amount = amountAction(db, s);
        await untilSleeping(pool);
        const transition = createEntryTransitionMethod(db).transition(
          s.ctx,
          s.entries[0]!.id,
          'acceptance',
          'pending',
          'accepted',
          'office',
          'x',
        );
        const [a, b] = await Promise.allSettled([amount, transition]);
        expect(a).toMatchObject({ status: 'fulfilled' });
        expect(b).toMatchObject({ status: 'fulfilled' });
      });
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, s.invoice.id));
      expect(invoice?.totalCents).toBe(3000);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('repeats a transition the database aborted as a deadlock victim, and reports a persistent clash as concurrent_update', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'retry', { orgConfig: cfg(100) });
    try {
      const deadlock = () =>
        Object.assign(new Error('deadlock detected'), { code: '40P01' });
      let failures = 1;
      const flaky = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'transaction')
            return (...args: Parameters<typeof db.transaction>) => {
              if (failures-- > 0)
                return Promise.reject(
                  Object.assign(new Error('x'), { cause: deadlock() }),
                );
              return target.transaction(...args);
            };
          return Reflect.get(target, property, receiver);
        },
      }) as typeof db;
      const moved = await createEntryTransitionMethod(flaky).transition(
        s.ctx,
        s.entries[0]!.id,
        'acceptance',
        'pending',
        'accepted',
        'office',
        'x',
      );
      expect(moved).not.toBeNull();
      failures = 99;
      await expect(
        createEntryTransitionMethod(flaky).transition(
          s.ctx,
          s.entries[0]!.id,
          'acceptance',
          'accepted',
          'pending',
          'office',
          'x',
        ),
      ).rejects.toThrow('concurrent_update');
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
});

describe.skipIf(!url)(
  'permanent provider errors leave no stuck reservation (P2-B)',
  () => {
    const age = async (db: Db, s: Seed) => {
      await db
        .update(paymentRefundIntents)
        .set({ updatedAt: new Date(0), claimedAt: new Date(0) })
        .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
    };
    it('releases the reservation after a definitive rejection and allows the reactivation', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'perm', { orgConfig: cfg(100) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        const result = await settle(db, s, [], async () => {
          throw new RefundRejectedError('charge_already_refunded');
        });
        expect(result).toMatchObject({
          status: 'failed',
          failure: 'provider_rejected',
        });
        const [reservation] = await db
          .select()
          .from(paymentRefundReservations)
          .where(eq(paymentRefundReservations.invoiceId, s.invoice.id));
        expect(reservation?.status).toBe('rejected');
        expect(await reactivate(db, s)).not.toBeNull();
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('escalates an unclassified error after the attempt limit and gives the office a way out', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'stuck', { orgConfig: cfg(100) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        const refunds = createPaymentRefundRepository(db);
        const calls: ProviderCall[] = [];
        const boom = async () => {
          throw Object.assign(new Error('Stripe says no'), {
            code: 'weird_state',
          });
        };
        let last = null;
        for (let attempt = 1; attempt <= MAX_REFUND_ATTEMPTS; attempt += 1) {
          await age(db, s);
          last = await settle(db, s, calls, boom);
          if (attempt < MAX_REFUND_ATTEMPTS)
            expect(last).toMatchObject({ failure: 'provider_unavailable' });
        }
        expect(last).toMatchObject({
          status: 'failed',
          failure: 'needs_review',
        });
        expect(calls).toHaveLength(MAX_REFUND_ATTEMPTS);
        const [reservation] = await db
          .select()
          .from(paymentRefundReservations)
          .where(eq(paymentRefundReservations.invoiceId, s.invoice.id));
        expect(reservation).toMatchObject({
          status: 'reserved',
          attempts: MAX_REFUND_ATTEMPTS,
          lastError: 'weird_state',
        });
        expect(reservation?.needsReviewAt).not.toBeNull();
        // No automatic retry any more, however old it gets.
        await age(db, s);
        expect(await settle(db, s, calls, boom)).toBeNull();
        expect(calls).toHaveLength(MAX_REFUND_ATTEMPTS);
        expect(
          await createRefundIntentRepository(db).staleInvoiceIds(s.ctx),
        ).not.toContain(s.invoice.id);
        // Visible to the office, still blocking amount and reactivation.
        const summary = (
          await loadInvoiceSummaries(db, s.ctx, [s.group.id])
        ).get(s.group.id);
        expect(summary?.stuckRefunds).toEqual([
          {
            key: reservation!.idempotencyKey,
            providerPaymentId: piOf(s),
            amountCents: 4200,
          },
        ]);
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 1)),
        ).toMatchObject({
          status: 'unavailable',
          availableCents: 0,
        });
        await expect(reactivate(db, s)).rejects.toThrow('refund_needs_review');
        // The office decides: only a flagged reservation of this invoice can be abandoned.
        const key = reservation!.idempotencyKey;
        expect(
          await refunds.abandonReservation!(s.ctx, {
            invoiceId: s.invoice.id,
            key: 'unknown',
            actor: 'office',
            reason: 'x',
          }),
        ).toBe('not_found');
        expect(
          await refunds.abandonReservation!(s.ctx, {
            invoiceId: s.invoice.id,
            key,
            actor: 'office',
            reason: 'In Stripe geprüft: keine Erstattung ausgeführt',
          }),
        ).toBe('abandoned');
        expect(
          await refunds.abandonReservation!(s.ctx, {
            invoiceId: s.invoice.id,
            key,
            actor: 'office',
            reason: 'again',
          }),
        ).toBe('not_reviewable');
        const [closed] = await db
          .select()
          .from(paymentRefundReservations)
          .where(eq(paymentRefundReservations.invoiceId, s.invoice.id));
        expect(closed).toMatchObject({
          status: 'abandoned',
          resolvedBy: 'office',
          resolvedReason: 'In Stripe geprüft: keine Erstattung ausgeführt',
        });
        expect(closed?.resolvedAt).not.toBeNull();
        const [intent] = await db
          .select()
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
        expect(intent?.failure).toBe('reservation_abandoned');
        expect(
          (await loadInvoiceSummaries(db, s.ctx, [s.group.id])).get(s.group.id)
            ?.stuckRefunds,
        ).toEqual([]);
        // The amount is free again, the old key stays closed, and the registration can take part again.
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 4200, key)),
        ).toEqual({
          status: 'unavailable',
          reason: 'closed',
        });
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 4200)),
        ).toMatchObject({
          status: 'reserved',
        });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('refuses to abandon a reservation that is not flagged for review, so an in-flight refund cannot be released', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'inflight');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const refunds = createPaymentRefundRepository(db);
        const reservation = await refunds.reserve(
          s.ctx,
          manual(s, piOf(s), 1000),
        );
        if (reservation.status !== 'reserved') throw new Error('unreachable');
        expect(
          await refunds.abandonReservation!(s.ctx, {
            invoiceId: s.invoice.id,
            key: reservation.idempotencyKey,
            actor: 'office',
            reason: 'x',
          }),
        ).toBe('not_reviewable');
        for (let attempt = 1; attempt < MAX_REFUND_ATTEMPTS; attempt += 1)
          expect(
            await refunds.recordFailedAttempt!(
              s.ctx,
              reservation.idempotencyKey,
              'boom',
            ),
          ).toBe('retry');
        expect(
          await refunds.recordFailedAttempt!(
            s.ctx,
            reservation.idempotencyKey,
            'boom',
          ),
        ).toBe('needs_review');
        // Even a retry with the original manual key must not restart an
        // operation the office may now abandon.
        expect(
          await refunds.reserve(
            s.ctx,
            manual(s, piOf(s), 1000, reservation.idempotencyKey),
          ),
        ).toEqual({ status: 'needs_review' });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
  },
);

describe.skipIf(!url)(
  'the invoice row lock of the refund operations (P2-C)',
  () => {
    it('parallel manual reservations cannot both claim the same remainder', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'lock-race');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const refunds = createPaymentRefundRepository(db);
        for (let round = 0; round < 8; round += 1) {
          await db.execute(
            sql`delete from payment_refund_reservation where invoice_id = ${s.invoice.id}`,
          );
          const results = await Promise.all(
            Array.from({ length: 4 }, () =>
              refunds.reserve(s.ctx, manual(s, piOf(s), 3000)),
            ),
          );
          expect(results.filter((r) => r.status === 'reserved')).toHaveLength(
            1,
          );
        }
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('a manual reservation waits for the invoice row lock', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'lock-manual');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const refunds = createPaymentRefundRepository(db);
        const result = await waitsForInvoiceLock(pool, s, () =>
          refunds.reserve(s.ctx, manual(s, piOf(s), 1000)),
        );
        expect(result.status).toBe('reserved');
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('an automatic reservation waits for the invoice row lock', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'lock-auto', { orgConfig: cfg(50) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        const intents = createRefundIntentRepository(db);
        const claimed = await intents.claim(s.ctx, s.invoice.id);
        const refunds = createPaymentRefundRepository(db);
        const result = await waitsForInvoiceLock(pool, s, () =>
          refunds.reserve(s.ctx, {
            invoiceId: s.invoice.id,
            providerPaymentId: piOf(s),
            idempotencyKey: `auto-refund:${claimed!.id}:${piOf(s)}`,
            source: { kind: 'automatic', intentId: claimed!.id, percent: 50 },
          }),
        );
        expect(result).toMatchObject({ status: 'reserved', amountCents: 2100 });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('failed attempts, rejections and abandoning wait for the invoice row lock', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'lock-review');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const refunds = createPaymentRefundRepository(db);
        const reserved = await refunds.reserve(s.ctx, manual(s, piOf(s), 1000));
        if (reserved.status !== 'reserved') throw new Error('unreachable');
        const key = reserved.idempotencyKey;
        for (let attempt = 1; attempt < MAX_REFUND_ATTEMPTS; attempt += 1)
          await waitsForInvoiceLock(pool, s, () =>
            refunds.recordFailedAttempt!(s.ctx, key, 'boom'),
          );
        expect(
          await waitsForInvoiceLock(pool, s, () =>
            refunds.recordFailedAttempt!(s.ctx, key, 'boom'),
          ),
        ).toBe('needs_review');
        expect(
          await waitsForInvoiceLock(pool, s, () =>
            refunds.abandonReservation!(s.ctx, {
              invoiceId: s.invoice.id,
              key,
              actor: 'office',
              reason: 'x',
            }),
          ),
        ).toBe('abandoned');
        const second = await refunds.reserve(s.ctx, manual(s, piOf(s), 500));
        if (second.status !== 'reserved') throw new Error('unreachable');
        await waitsForInvoiceLock(pool, s, () =>
          refunds.rejectReservation!(s.ctx, second.idempotencyKey),
        );
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
  },
);

describe.skipIf(!url)(
  'finished intents keep their history on reactivation (P3-1)',
  () => {
    it('marks a done intent as superseded, keeps what was refunded and lets a new cancellation open a new intent', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'history', { orgConfig: cfg(50) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        await settle(db, s, []);
        await reactivate(db, s);
        const [first] = await db
          .select()
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
        expect(first).toMatchObject({
          status: 'superseded',
          refundedCents: 2100,
          percent: 50,
          failure: null,
        });
        await reject(db, s);
        const all = await db
          .select({ status: paymentRefundIntents.status })
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
        expect(all.map((row) => row.status).sort()).toEqual([
          'pending',
          'superseded',
        ]);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
    it('still voids waiting intents as skipped', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'waiting', { orgConfig: cfg(50) });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await reject(db, s);
        await reactivate(db, s);
        const [intent] = await db
          .select()
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
        expect(intent).toMatchObject({
          status: 'skipped',
          failure: 'registration_reactivated',
        });
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });
  },
);
