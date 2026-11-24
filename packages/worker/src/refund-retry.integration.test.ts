import { eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCheckoutRepository,
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
import type { PaymentProvider } from '@nennbox/core';
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
    return { orgId: org!.id, intentId: row!.id, invoiceId: invoice!.id };
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
    await repo.createSession(ctx, s.invoiceId, {
      id: 'cs-' + s.invoiceId,
      url: 'https://checkout.test/unpaid',
      amountCents: 4200,
      paymentMethods: ['card'],
      expiresAt: null,
    });
    let calls = 0;
    const task = createRefundRetryTask({
      db,
      deploymentMode: 'community',
      communityOrganizationId: s.orgId,
      provider: {
        expireCheckoutSession: async () => {
          if (++calls === 1) throw new Error('offline');
          return 'expired';
        },
        refund: async () => {
          throw new Error('unpaid: no refund');
        },
      } as unknown as PaymentProvider,
    });
    await task();
    expect(await repo.pendingSessions(ctx, s.invoiceId)).toHaveLength(1);
    await task();
    expect(calls).toBe(2);
    expect(await repo.pendingSessions(ctx, s.invoiceId)).toHaveLength(0);
  });
});
