import { retryManualRefundReservations } from './refund-reservation-retry.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  RefundRejectedError,
  createRequestContext,
  organizationId,
  settleCancellationRefund,
} from '@nennbox/core';
import type { PaymentProvider, PaymentProviderEvent } from '@nennbox/core';
import { createDatabase, migrate } from '@nennbox/adapter-postgres';
import { createCheckoutRepository } from '@nennbox/adapter-postgres';
import { createPaymentRefundRepository } from '@nennbox/adapter-postgres';
import {
  entries,
  eventClasses,
  events,
  invoices,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from '@nennbox/adapter-postgres';
import {
  createRefundIntentRepository,
  paymentRefundIntents,
} from '@nennbox/adapter-postgres';
import { emailOutbox } from '@nennbox/adapter-postgres';
type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type Seed = Awaited<ReturnType<typeof seed>>;
type ProviderCall = Parameters<PaymentProvider['refund']>[0];
const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;
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
const ledgerSum = async (db: Db, s: Seed, providerPaymentId?: string) =>
  Number(
    rowsOf<{ n: number }>(
      await db.execute(
        sql`select coalesce(sum(amount_cents), 0)::int as n from invoice_payment where invoice_id = ${s.invoice.id} ${providerPaymentId ? sql`and provider_payment_id = ${providerPaymentId}` : sql``}`,
      ),
    )[0]!.n,
  );

describe.skipIf(!url)('refund execution claim', () => {
  it('a lost claim connection cannot make an in-flight provider operation abandonable', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'lost-claim');
    const refunds = createPaymentRefundRepository(db);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let running: Promise<unknown> | undefined;
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      const key = crypto.randomUUID();
      await refunds.reserve(s.ctx, manual(s, piOf(s), 1000, key));
      running = refunds.withExecution(s.ctx, key, async () => {
        entered();
        await gate;
        return true;
      });
      running.catch(() => undefined);
      await ready;
      const claims = await pool.query(
        "select pid from pg_stat_activity where datname=current_database() and application_name='nennbox-refund-claim' and state='idle in transaction'",
      );
      expect(claims.rows).toHaveLength(1);
      await pool.query('select pg_terminate_backend($1)', [claims.rows[0].pid]);
      // The original provider remains blocked. Same-key recovery encounters an
      // uncertain predecessor, then fails ambiguously five times.
      for (let i = 0; i < 5; i++)
        await refunds.withExecution(s.ctx, key, async () => {
          await refunds.recordFailedAttempt!(s.ctx, key, 'ambiguous');
          return true;
        });
      expect(
        await refunds.abandonReservation!(s.ctx, {
          invoiceId: s.invoice.id,
          key,
          actor: 'office',
          reason: 'not visible yet',
        }),
      ).toBe('not_reviewable');
      expect(
        await refunds.reserve(s.ctx, manual(s, piOf(s), 3201)),
      ).toMatchObject({ status: 'unavailable', availableCents: 3200 });
      expect(
        await refunds.requestReconciliation!(s.ctx, {
          invoiceId: s.invoice.id,
          key,
          actor: 'office-auditor',
          reason: 'Stripe support cannot confirm yet',
        }),
      ).toBe('scheduled');
      const audit = await pool.query(
        'select * from payment_refund_reservation where idempotency_key=$1',
        [key],
      );
      expect(audit.rows[0]).toMatchObject({
        status: 'reserved',
        execution_uncertain: true,
        resolved_by: 'office-auditor',
        resolved_reason:
          'Reconciliation requested: Stripe support cannot confirm yet',
      });
      expect(audit.rows[0].execution_token).toBeTruthy();
      expect(
        await refunds.abandonReservation!(s.ctx, {
          invoiceId: s.invoice.id,
          key,
          actor: 'office',
          reason: 'still unclear',
        }),
      ).toBe('not_reviewable');
      release();
      await expect(running).rejects.toThrow();
      const total = await pool.query(
        "select coalesce(sum(amount_cents),0)::int n from payment_refund_reservation where invoice_id=$1 and status='reserved'",
        [s.invoice.id],
      );
      expect(
        4200 - (await ledgerSum(db, s)) + total.rows[0].n,
      ).toBeLessThanOrEqual(4200);
    } finally {
      release();
      await running?.catch(() => undefined);
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('a stale automatic takeover cannot finish the live executor intent as failed', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'auto-takeover', {
      orgConfig: {
        payments: {
          refundPolicy: {
            enabled: true,
            tiers: [{ daysBefore: 0, percent: 50 }],
            rejectedPercent: 50,
          },
        },
      },
    });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        entered = r;
      });
    let running: Promise<unknown> | undefined;
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await db
        .update(entries)
        .set({ acceptanceStatus: 'withdrawn' })
        .where(eq(entries.id, s.entries[0]!.id));
      const [intent] = await db
        .insert(paymentRefundIntents)
        .values({
          organizationId: s.org.id,
          invoiceId: s.invoice.id,
          entryId: s.entries[0]!.id,
          trigger: 'withdrawn',
        })
        .returning();
      const calls: ProviderCall[] = [];
      const deps = {
        intents: createRefundIntentRepository(db),
        refunds: createPaymentRefundRepository(db),
        provider: provider(calls, async () => {
          entered();
          await gate;
          return { id: 're-takeover-' + s.suffix };
        }),
      };
      running = settleCancellationRefund(s.ctx, s.invoice.id, deps);
      await ready;
      await db.execute(
        sql`update payment_refund_intent set claimed_at=to_timestamp(0) where id=${intent!.id}`,
      );
      expect(
        await settleCancellationRefund(s.ctx, s.invoice.id, deps),
      ).toBeNull();
      release();
      await running;
      expect(calls).toHaveLength(1);
      const [state] = await db
        .select()
        .from(paymentRefundIntents)
        .where(eq(paymentRefundIntents.id, intent!.id));
      expect(state).toMatchObject({ status: 'done', refundedCents: 2100 });
      expect(await ledgerSum(db, s)).toBe(2100);
    } finally {
      release();
      await running;
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it('a running executor excludes abandonment and same-key execution until booking', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'execution-wins');
    const refunds = createPaymentRefundRepository(db);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let running: Promise<unknown> | undefined;
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      const key = crypto.randomUUID();
      await refunds.reserve(s.ctx, manual(s, piOf(s), 1000, key));
      running = refunds.withExecution(s.ctx, key, async () => {
        entered();
        await gate;
        return refunds.recordRefund(s.ctx, {
          invoiceId: s.invoice.id,
          providerPaymentId: piOf(s),
          providerRefundId: 're-running-' + s.suffix,
          amountCents: 1000,
          refundableCents: 1000,
          currency: 'EUR',
          actor: 'office',
          reason: 'refund',
          reservationKey: key,
        });
      });
      await ready;
      // Even a stale error reporter flagging it cannot release a live claim.
      for (let i = 0; i < 5; i++)
        await refunds.recordFailedAttempt!(s.ctx, key, 'ambiguous');
      expect(
        await refunds.abandonReservation!(s.ctx, {
          invoiceId: s.invoice.id,
          key,
          actor: 'office',
          reason: 'checked',
        }),
      ).toBe('not_reviewable');
      let executed = false;
      expect(
        await refunds.withExecution(s.ctx, key, async () => {
          executed = true;
          return true;
        }),
      ).toBeNull();
      expect(executed).toBe(false);
      expect(
        await refunds.reserve(s.ctx, manual(s, piOf(s), 3201)),
      ).toMatchObject({ status: 'unavailable', availableCents: 3200 });
      release();
      expect(await running).toBe('recorded');
      expect(await ledgerSum(db, s)).toBe(3200);
    } finally {
      release();
      await running;
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
  it.each(['abandoned', 'unreserved'] as const)(
    'booking cannot steal outstanding funds (%s)',
    async (mode) => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'booking-bound');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const refunds = createPaymentRefundRepository(db),
          key = crypto.randomUUID();
        if (mode === 'abandoned') {
          await refunds.reserve(s.ctx, manual(s, piOf(s), 1000, key));
          for (let i = 0; i < 5; i++)
            await refunds.recordFailedAttempt!(s.ctx, key, 'ambiguous');
          expect(
            await refunds.abandonReservation!(s.ctx, {
              invoiceId: s.invoice.id,
              key,
              actor: 'office',
              reason: 'checked',
            }),
          ).toBe('abandoned');
        }
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 4200)),
        ).toMatchObject({ status: 'reserved', amountCents: 4200 });
        expect(
          await refunds.recordRefund(s.ctx, {
            invoiceId: s.invoice.id,
            providerPaymentId: piOf(s),
            providerRefundId: 're-stale-' + s.suffix,
            amountCents: 1000,
            refundableCents: 4200,
            currency: 'EUR',
            actor: 'office',
            reason: 'stale',
            ...(mode === 'abandoned' ? { reservationKey: key } : {}),
          }),
        ).toBeNull();
        const reserved = rowsOf<{ n: number }>(
          await db.execute(
            sql`select coalesce(sum(amount_cents),0)::int n from payment_refund_reservation where invoice_id=${s.invoice.id} and status='reserved'`,
          ),
        )[0]!.n;
        expect(
          4200 - (await ledgerSum(db, s)) + Number(reserved),
        ).toBeLessThanOrEqual(4200);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    },
  );
  it.each([1000, 3200])(
    'worker must not execute an abandoned snapshot operation (replacement %i)',
    async (replacementCents) => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'worker-stale');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const refunds = createPaymentRefundRepository(db);
        const keys = [crypto.randomUUID(), crypto.randomUUID()];
        for (const key of keys)
          await refunds.reserve(s.ctx, manual(s, piOf(s), 1000, key));
        await db.execute(
          sql`update payment_refund_reservation set updated_at=to_timestamp(0) where invoice_id=${s.invoice.id}`,
        );
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>((r) => (entered = r)),
          gate = new Promise<void>((r) => (release = r));
        const calls: ProviderCall[] = [];
        const worker = retryManualRefundReservations(
          db,
          s.ctx,
          provider(calls, async (req) => {
            if (calls.length === 1) {
              entered();
              await gate;
            }
            return { id: 're-worker-' + req.idempotencyKey };
          }),
          1000,
        );
        await ready;
        const stale = keys.find((k) => k !== calls[0]!.idempotencyKey)!;
        const failedProvider = provider([], async () => {
          throw Object.assign(new Error('ambiguous'), { code: 'ambiguous' });
        });
        for (let i = 0; i < 5; i++) {
          const retry = await refunds.reserve(
            s.ctx,
            manual(s, piOf(s), 1000, stale),
          );
          expect(retry.status).toBe('reserved');
          if (retry.status !== 'reserved') throw Error('retry missing');
          await refunds.withExecution(s.ctx, stale, async () => {
            try {
              await failedProvider.refund({
                organizationId: s.ctx.organizationId,
                invoiceId: s.invoice.id,
                paymentId: piOf(s),
                idempotencyKey: stale,
                amountCents: 1000,
                reason: 'retry',
              });
              throw Error('expected provider failure');
            } catch {
              await refunds.recordFailedAttempt!(s.ctx, stale, 'ambiguous');
            }
          });
        }
        expect(
          await refunds.abandonReservation!(s.ctx, {
            invoiceId: s.invoice.id,
            key: stale,
            actor: 'office',
            reason: 'Checked: not yet executed',
          }),
        ).toBe('abandoned');
        const replacement = await refunds.reserve(
          s.ctx,
          manual(s, piOf(s), replacementCents),
        );
        expect(replacement).toMatchObject({
          status: 'reserved',
          amountCents: replacementCents,
        });
        if (replacementCents === 1000 && replacement.status === 'reserved') {
          expect(
            await refunds.recordRefund(s.ctx, {
              invoiceId: s.invoice.id,
              providerPaymentId: piOf(s),
              providerRefundId: 're-replacement-' + s.suffix,
              amountCents: 1000,
              refundableCents: 1000,
              currency: 'EUR',
              actor: 'office',
              reason: 'new decision',
              reservationKey: replacement.idempotencyKey,
            }),
          ).toBe('recorded');
        }
        release();
        await worker;
        const outstanding = rowsOf<{ n: number }>(
          await db.execute(
            sql`select coalesce(sum(amount_cents),0)::int n from payment_refund_reservation where invoice_id=${s.invoice.id} and status='reserved'`,
          ),
        )[0]!.n;
        expect(
          4200 - (await ledgerSum(db, s)) + Number(outstanding),
        ).toBeLessThanOrEqual(4200);
        expect(calls.map((c) => c.idempotencyKey)).not.toContain(stale);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    },
  );
});

describe.skipIf(!url)('review4 connection-loss recovery liveness', () => {
  it.each(['succeeded', 'rejected'] as const)(
    'allows provider-confirmed %s recovery after a lost claim and five temporary outages',
    async (outcome) => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'review4-stuck');
      const refunds = createPaymentRefundRepository(db);
      const key = crypto.randomUUID();
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => (entered = r)),
        gate = new Promise<void>((r) => (release = r));
      let original: Promise<unknown> | undefined;
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await refunds.reserve(s.ctx, manual(s, piOf(s), 1000, key));
        original = refunds.withExecution(s.ctx, key, async () => {
          entered();
          await gate;
          throw new Error('transport lost');
        });
        original.catch(() => undefined);
        await ready;
        const claims = await pool.query(
          "select pid from pg_stat_activity where application_name='nennbox-refund-claim' and state='idle in transaction'",
        );
        expect(claims.rows).toHaveLength(1);
        await pool.query('select pg_terminate_backend($1)', [
          claims.rows[0].pid,
        ]);
        release();
        await original.catch(() => undefined);
        const failedCalls: ProviderCall[] = [];
        for (let i = 0; i < 5; i++) {
          await db.execute(
            sql`update payment_refund_reservation set updated_at=to_timestamp(0) where invoice_id=${s.invoice.id}`,
          );
          await retryManualRefundReservations(
            db,
            s.ctx,
            provider(failedCalls, async () => {
              throw Error('temporary Stripe outage');
            }),
            1000,
          );
        }
        expect(failedCalls).toHaveLength(5);
        expect(
          await refunds.reserve(s.ctx, manual(s, piOf(s), 3201)),
        ).toMatchObject({ status: 'unavailable', availableCents: 3200 });
        const reserve = await refunds.reserve(
          s.ctx,
          manual(s, piOf(s), 1000, key),
        );
        expect(reserve.status).toBe('reserved');
        const abandon = await refunds.abandonReservation!(s.ctx, {
          invoiceId: s.invoice.id,
          key,
          actor: 'office',
          reason: 'provider checked, no transfer',
        });
        await db.execute(
          sql`update payment_refund_reservation set updated_at=to_timestamp(0) where invoice_id=${s.invoice.id}`,
        );
        const healthyCalls: ProviderCall[] = [];
        await retryManualRefundReservations(
          db,
          s.ctx,
          provider(healthyCalls, async () => {
            if (outcome === 'rejected') throw new RefundRejectedError();
            return { id: 're-recovered-' + s.suffix };
          }),
          1000,
        );
        let gated = false;
        const gateResult = await refunds.withExecution(s.ctx, key, async () => {
          gated = true;
          return true;
        });
        const state = await pool.query(
          'select status, attempts, needs_review_at is not null as review, execution_token is not null as token, execution_uncertain from payment_refund_reservation where idempotency_key=$1',
          [key],
        );
        expect(abandon).toBe('not_reviewable');
        expect(gateResult).toBeNull();
        expect(gated).toBe(false);
        expect(state.rows[0].status).toBe(
          outcome === 'succeeded' ? 'completed' : 'rejected',
        );
        expect(await ledgerSum(db, s)).toBe(
          outcome === 'succeeded' ? 3200 : 4200,
        );
        expect(healthyCalls[0]?.idempotencyKey).toBe(key);
        expect(
          healthyCalls,
          'Provider is healthy again, but every recovery and office path is blocked',
        ).toHaveLength(1);
      } finally {
        release();
        await original?.catch(() => undefined);
        await cleanup(db, s.org.id);
        await pool.end();
      }
    },
  );
});

// Exercise both automatic discovery predicates, reserve and execution gate after
// review, not only the manual batch selector above.
describe.skipIf(!url)('uncertain automatic review recovery', () => {
  it('discovers and settles an uncertain automatic operation beyond the retry budget', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'automatic-review', {
      orgConfig: {
        payments: {
          refundPolicy: {
            enabled: true,
            tiers: [{ daysBefore: 0, percent: 50 }],
            rejectedPercent: 50,
          },
        },
      },
    });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await db
        .update(entries)
        .set({ acceptanceStatus: 'withdrawn' })
        .where(eq(entries.id, s.entries[0]!.id));
      const [intent] = await db
        .insert(paymentRefundIntents)
        .values({
          organizationId: s.org.id,
          invoiceId: s.invoice.id,
          entryId: s.entries[0]!.id,
          trigger: 'withdrawn',
          status: 'processing',
        })
        .returning();
      const key = `auto-refund:${intent!.id}:${piOf(s)}`;
      const refunds = createPaymentRefundRepository(db);
      expect(
        await refunds.reserve(s.ctx, {
          invoiceId: s.invoice.id,
          providerPaymentId: piOf(s),
          idempotencyKey: key,
          source: { kind: 'automatic', intentId: intent!.id, percent: 50 },
        }),
      ).toMatchObject({ status: 'reserved', amountCents: 2100 });
      await db.execute(
        sql`update payment_refund_reservation set execution_token=${crypto.randomUUID()}, execution_uncertain=true, attempts=5, needs_review_at=now() where idempotency_key=${key}`,
      );
      await db.execute(
        sql`update payment_refund_intent set status='failed', updated_at=to_timestamp(0) where id=${intent!.id}`,
      );
      const intents = createRefundIntentRepository(db, { retryAfterMs: 1000 });
      expect(await intents.staleInvoiceIds(s.ctx)).toContain(s.invoice.id);
      const calls: ProviderCall[] = [];
      expect(
        await settleCancellationRefund(s.ctx, s.invoice.id, {
          intents,
          refunds,
          provider: provider(calls),
        }),
      ).toMatchObject({ status: 'done', refundedCents: 2100 });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.idempotencyKey).toBe(key);
      expect(await ledgerSum(db, s)).toBe(2100);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
});
