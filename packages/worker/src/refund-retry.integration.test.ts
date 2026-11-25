import { eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCheckoutRepository,
  createPaymentRefundRepository,
  createRefundIntentRepository,
  paymentRefundReservations,
  createDatabase,
  entries,
  eventClasses,
  events,
  invoicePayments,
  invoices,
  migrate,
  organizations,
  paymentRefundIntents,
  people,
  registrationGroups,
  vehicles,
  type Database,
} from '@nennbox/adapter-postgres';
import {
  settleCancellationRefund,
  RefundRejectedError,
  type PaymentProvider,
  type RequestContext,
} from '@nennbox/core';
import { createRefundRetryTask } from './refund-retry.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const rule = {
  payments: {
    refundPolicy: {
      enabled: true,
      tiers: [{ daysBefore: 0, percent: 50 }],
      rejectedPercent: 100,
    },
  },
};

describe.skipIf(!url)('automatic refund retry job (PostgreSQL)', () => {
  let db: Database;
  let end: () => Promise<void>;
  const created: string[] = [];

  beforeAll(async () => {
    await migrate(url!);
    await runMigrations({ connectionString: url! });
    const database = await createDatabase(url!);
    db = database.db;
    end = () => database.pool.end();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      if (created.length) {
        await db.delete(events).where(inArray(events.organizationId, created));
        await db
          .delete(organizations)
          .where(inArray(organizations.id, created));
      }
    } finally {
      await end();
    }
  });

  /** A fully cancelled registration with one online payment of 42,00 and an unfinished refund intent. */
  async function seed(
    label: string,
    intent: { status: 'pending' | 'processing'; ageMinutes: number },
  ) {
    const suffix = crypto.randomUUID();
    const [org] = await db
      .insert(organizations)
      .values({
        slug: `retry-${label}-${suffix}`,
        name: label,
        timezone: 'UTC',
        locale: 'de',
        currency: 'EUR',
        registrationFormConfig: rule,
      })
      .returning();
    created.push(org!.id);
    const [event] = await db
      .insert(events)
      .values({
        organizationId: org!.id,
        slug: 'e',
        name: 'E',
        startsOn: '2035-06-01',
        endsOn: '2035-06-02',
      })
      .returning();
    const [klass] = await db
      .insert(eventClasses)
      .values({
        organizationId: org!.id,
        eventId: event!.id,
        name: 'GT',
        code: 'GT',
        vehicleType: 'car',
      })
      .returning();
    const [person] = await db
      .insert(people)
      .values({ organizationId: org!.id, firstName: 'A', lastName: 'B' })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({ organizationId: org!.id, make: 'M', model: 'X' })
      .returning();
    const [group] = await db
      .insert(registrationGroups)
      .values({
        organizationId: org!.id,
        eventId: event!.id,
        personId: person!.id,
      })
      .returning();
    const [entry] = await db
      .insert(entries)
      .values({
        orgaCode: `R-${crypto.randomUUID()}`,
        organizationId: org!.id,
        eventId: event!.id,
        classId: klass!.id,
        registrationGroupId: group!.id,
        driverPersonId: person!.id,
        vehicleId: vehicle!.id,
        acceptanceStatus: 'withdrawn',
      })
      .returning();
    const [invoice] = await db
      .insert(invoices)
      .values({
        organizationId: org!.id,
        eventId: event!.id,
        registrationGroupId: group!.id,
        totalCents: 4200,
        currency: 'EUR',
        paymentReference: `RF-${suffix}`,
        status: 'paid',
      })
      .returning();
    await db.insert(invoicePayments).values({
      organizationId: org!.id,
      invoiceId: invoice!.id,
      amountCents: 4200,
      method: 'online',
      actor: 'stripe:webhook',
      reason: 'Stripe payment',
      providerPaymentId: `pi_${suffix}`,
    });
    const [row] = await db
      .insert(paymentRefundIntents)
      .values({
        organizationId: org!.id,
        invoiceId: invoice!.id,
        entryId: entry!.id,
        trigger: 'withdrawn',
        status: intent.status,
      })
      .returning();
    const ago = sql`now() - make_interval(mins => ${intent.ageMinutes})`;
    await db.execute(
      intent.status === 'processing'
        ? sql`update payment_refund_intent set claimed_at = ${ago} where id = ${row!.id}`
        : sql`update payment_refund_intent set created_at = ${ago} where id = ${row!.id}`,
    );
    return {
      orgId: org!.id,
      intentId: row!.id,
      invoiceId: invoice!.id,
      entryId: entry!.id,
    };
  }

  const statusOf = async (intentId: string) =>
    (
      await db
        .select({
          status: paymentRefundIntents.status,
          refundedCents: paymentRefundIntents.refundedCents,
        })
        .from(paymentRefundIntents)
        .where(eq(paymentRefundIntents.id, intentId))
    )[0];

  it('finishes stale pending and in-progress refunds per organization and leaves fresh and foreign ones alone', async () => {
    const a = await seed('a', { status: 'pending', ageMinutes: 30 });
    const b = await seed('b', { status: 'processing', ageMinutes: 30 });
    const fresh = await seed('fresh', { status: 'pending', ageMinutes: 1 });
    const calls: Array<{
      organizationId: string;
      idempotencyKey: string;
      amountCents: number;
    }> = [];
    const provider = {
      refund: async (request: (typeof calls)[number]) => {
        calls.push(request);
        return { id: `re_${request.idempotencyKey}` };
      },
    } as unknown as PaymentProvider;

    // A single-organization (Community) worker touches only its own organization.
    await createRefundRetryTask({
      db,
      provider,
      deploymentMode: 'community',
      communityOrganizationId: a.orgId,
    })();
    expect(await statusOf(a.intentId)).toMatchObject({
      status: 'done',
      refundedCents: 2100,
    });
    expect(await statusOf(b.intentId)).toMatchObject({ status: 'processing' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      organizationId: a.orgId,
      amountCents: 2100,
    });
    expect(calls[0]!.idempotencyKey).toMatch(
      new RegExp(`^auto-refund:${a.intentId}:pi_`),
    );

    // A multi-organization worker takes over the abandoned one, not the fresh one.
    await createRefundRetryTask({ db, provider, deploymentMode: 'cloud' })();
    expect(await statusOf(b.intentId)).toMatchObject({
      status: 'done',
      refundedCents: 2100,
    });
    expect(await statusOf(fresh.intentId)).toMatchObject({ status: 'pending' });

    // Another run changes nothing: no second refund for anybody.
    const before = calls.length;
    await createRefundRetryTask({ db, provider, deploymentMode: 'cloud' })();
    expect(calls).toHaveLength(before);
    expect(
      calls.filter((call) => call.organizationId === a.orgId),
    ).toHaveLength(1);
  });

  it('keeps going with the next refund and keeps the intent open when the provider is down', async () => {
    const a = await seed('down-a', { status: 'pending', ageMinutes: 30 });
    const b = await seed('down-b', { status: 'pending', ageMinutes: 30 });
    const warnings: string[] = [];
    let first = true;
    const provider = {
      refund: async (request: { idempotencyKey: string }) => {
        if (first) {
          first = false;
          throw new Error('stripe down');
        }
        return { id: `re_${request.idempotencyKey}` };
      },
    } as unknown as PaymentProvider;
    await createRefundRetryTask({
      db,
      provider,
      deploymentMode: 'cloud',
      logger: {
        info() {},
        warn: (message) => warnings.push(message),
        error() {},
      },
    })();
    const states = [
      (await statusOf(a.intentId))!.status,
      (await statusOf(b.intentId))!.status,
    ].sort();
    // One failed (visible in the admin detail), the other one was still processed.
    expect(states).toEqual(['done', 'failed']);
    expect(warnings).toContain('Automatic refund retry failed');
  });
  it('retries closing an unpaid cancellation checkout after a provider outage without a refund intent', async () => {
    const s = await seed('unpaid-close', { status: 'pending', ageMinutes: 30 });
    await db
      .delete(paymentRefundIntents)
      .where(eq(paymentRefundIntents.invoiceId, s.invoiceId));
    await db
      .delete(invoicePayments)
      .where(eq(invoicePayments.invoiceId, s.invoiceId));
    await db
      .update(invoices)
      .set({ status: 'open' })
      .where(eq(invoices.id, s.invoiceId));
    const ctx = { organizationId: s.orgId } as Parameters<
      ReturnType<typeof createCheckoutRepository>['createSession']
    >[0];
    const repo = createCheckoutRepository(db);
    expect(
      await createRefundIntentRepository(db).cancelledInvoiceForEntry(
        ctx,
        s.entryId,
      ),
    ).toBe(s.invoiceId);
    expect(await repo.get(ctx, s.invoiceId)).toMatchObject({
      paidCents: 0,
      allEntriesCancelled: true,
    });
    await repo.createSession(ctx, s.invoiceId, {
      id: 'cs-' + s.invoiceId,
      url: 'https://checkout.test/unpaid',
      amountCents: 4200,
      paymentMethods: ['card'],
      expiresAt: null,
    });
    let calls = 0;
    let refundCalls = 0;
    const provider = {
      expireCheckoutSession: async (request: { sessionId: string }) => {
        expect(request.sessionId).toBe('cs-' + s.invoiceId);
        if (++calls === 1) throw new Error('offline');
        return 'expired';
      },
      refund: async () => {
        refundCalls++;
        throw new Error('unpaid: no refund');
      },
    } as unknown as PaymentProvider;
    await createRefundRetryTask({
      db,
      deploymentMode: 'community',
      communityOrganizationId: s.orgId,
      provider,
    })();
    expect(calls).toBe(1);
    expect(await repo.pendingSessions(ctx, s.invoiceId)).toHaveLength(1);

    // Reconstruct both the worker and its connection pool. Recovery must depend
    // only on committed pending-session rows, not a retained task/intent in memory.
    const restarted = await createDatabase(url!);
    try {
      const task = createRefundRetryTask({
        db: restarted.db,
        deploymentMode: 'community',
        communityOrganizationId: s.orgId,
        provider,
      });
      await task();
      expect(calls).toBe(2);
      expect(await repo.pendingSessions(ctx, s.invoiceId)).toHaveLength(0);
      expect(
        await db
          .select()
          .from(paymentRefundIntents)
          .where(eq(paymentRefundIntents.invoiceId, s.invoiceId)),
      ).toHaveLength(0);
      await task();
      expect(calls).toBe(2);
      expect(refundCalls).toBe(0);
    } finally {
      await restarted.pool.end();
    }
  });
  it.each(['automatic', 'manual'] as const)(
    'recovers an unresolved %s operation with the persisted key and amount, without a second transfer',
    async (source) => {
      const s = await seed('recover-' + source, {
        status: 'pending',
        ageMinutes: 30,
      });
      const ctx = { organizationId: s.orgId } as RequestContext;
      const refunds = createPaymentRefundRepository(db);
      const intents = createRefundIntentRepository(db);
      const transfers = new Map<string, { id: string; amountCents: number }>();
      let calls = 0;
      const provider = {
        refund: async (request: {
          idempotencyKey: string;
          amountCents: number;
        }) => {
          calls++;
          const existing = transfers.get(request.idempotencyKey);
          if (existing) {
            expect(request.amountCents).toBe(existing.amountCents);
            return existing;
          }
          const refund = {
            id: 're-recover-' + s.invoiceId,
            amountCents: request.amountCents,
          };
          transfers.set(request.idempotencyKey, refund);
          return refund;
        },
      } as unknown as PaymentProvider;
      if (source === 'automatic') {
        const result = await settleCancellationRefund(ctx, s.invoiceId, {
          intents,
          refunds: { ...refunds, recordRefund: async () => null },
          provider,
        });
        expect(result).toMatchObject({
          status: 'failed',
          failure: 'ledger_rejected',
        });
        await db
          .update(paymentRefundIntents)
          .set({ updatedAt: new Date(0) })
          .where(eq(paymentRefundIntents.id, s.intentId));
      } else {
        const [payment] = await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, s.invoiceId));
        const operation = await refunds.reserve(ctx, {
          invoiceId: s.invoiceId,
          providerPaymentId: payment!.providerPaymentId!,
          idempotencyKey: crypto.randomUUID(),
          source: {
            kind: 'manual',
            amountCents: 2100,
            actor: 'office:original',
            reason: 'Original reason',
          },
        });
        if (operation.status !== 'reserved')
          throw new Error('Reservation failed');
        await provider.refund({
          organizationId: ctx.organizationId,
          invoiceId: s.invoiceId,
          paymentId: operation.providerPaymentId,
          idempotencyKey: operation.idempotencyKey,
          amountCents: operation.amountCents,
          reason: 'Original reason',
        });
        // Browser disappears after transfer, before booking; persisted operation survives.
        await db
          .delete(paymentRefundIntents)
          .where(eq(paymentRefundIntents.id, s.intentId));
        await db
          .update(paymentRefundReservations)
          .set({ updatedAt: new Date(0) })
          .where(eq(paymentRefundReservations.invoiceId, s.invoiceId));
      }
      const task = createRefundRetryTask({
        db,
        provider,
        deploymentMode: 'community',
        communityOrganizationId: s.orgId,
      });
      await task();
      expect(calls).toBe(2);
      expect(transfers.size).toBe(1);
      const ledger = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, s.invoiceId));
      const returned = ledger.filter((p) => p.amountCents < 0);
      expect(returned).toHaveLength(1);
      expect(returned[0]).toMatchObject({
        amountCents: -2100,
        actor: source === 'manual' ? 'office:original' : 'system:refund-policy',
      });
      if (source === 'manual')
        expect(returned[0]?.reason).toBe('Original reason');
      const [operation] = await db
        .select()
        .from(paymentRefundReservations)
        .where(eq(paymentRefundReservations.invoiceId, s.invoiceId));
      expect(operation?.status).toBe('completed');
      await task();
      expect(calls).toBe(2);
    },
  );
  it.each(['automatic', 'manual'] as const)(
    'releases only an authoritatively rejected %s operation',
    async (source) => {
      const s = await seed('rejected-' + source, {
        status: 'pending',
        ageMinutes: 30,
      });
      const ctx = { organizationId: s.orgId } as RequestContext;
      const refunds = createPaymentRefundRepository(db);
      const [payment] = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, s.invoiceId));
      const provider = {
        refund: async () => {
          throw new RefundRejectedError();
        },
      } as unknown as PaymentProvider;
      if (source === 'automatic') {
        const result = await settleCancellationRefund(ctx, s.invoiceId, {
          refunds,
          intents: createRefundIntentRepository(db),
          provider,
        });
        expect(result).toMatchObject({
          status: 'failed',
          failure: 'provider_rejected',
        });
      } else {
        const reserved = await refunds.reserve(ctx, {
          invoiceId: s.invoiceId,
          providerPaymentId: payment!.providerPaymentId!,
          idempotencyKey: crypto.randomUUID(),
          source: { kind: 'manual', amountCents: 2100 },
        });
        expect(reserved.status).toBe('reserved');
        await db
          .update(paymentRefundReservations)
          .set({ updatedAt: new Date(0) })
          .where(eq(paymentRefundReservations.invoiceId, s.invoiceId));
        await createRefundRetryTask({
          db,
          provider,
          deploymentMode: 'community',
          communityOrganizationId: s.orgId,
        })();
      }
      const [operation] = await db
        .select()
        .from(paymentRefundReservations)
        .where(eq(paymentRefundReservations.invoiceId, s.invoiceId));
      expect(operation?.status).toBe('rejected');
      expect(
        await refunds.reserve(ctx, {
          invoiceId: s.invoiceId,
          providerPaymentId: payment!.providerPaymentId!,
          idempotencyKey: crypto.randomUUID(),
          source: { kind: 'manual', amountCents: 2100 },
        }),
      ).toMatchObject({ status: 'reserved', amountCents: 2100 });
    },
  );
});
