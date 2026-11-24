import { and, eq, inArray, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createRequestContext,
  organizationId,
  settleCancellationRefund,
} from '@nennbox/core';
import type { PaymentProvider, PaymentProviderEvent } from '@nennbox/core';
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
  invoicePayments,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';
import {
  checkoutSessions,
  paymentRefundIntents,
} from './schema/provider-payments.js';
import { groupEmailVerifications } from './schema/public-registration.js';
import { createRegistrationVerificationMethods } from './registration-verification.js';
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

describe.skipIf(!url)('payment completion (PostgreSQL)', () => {
  it('keeps checkout state independent of event order: late expired after paid, per session', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'order');
    try {
      const repo = createCheckoutRepository(db);
      for (const id of [`cs-${s.suffix}`, `cs-other-${s.suffix}`])
        await repo.createSession(s.ctx, s.invoice.id, {
          id,
          url: `https://checkout.test/${id}`,
          amountCents: 4200,
          paymentMethods: ['card'],
          expiresAt: null,
        });
      const first = paid(s);
      expect(await repo.applyProviderEvent(first)).toBe('applied');
      // Provider notifications are unordered: the first checkout expires after it was paid.
      const late = {
        id: `evt-expired-${s.suffix}`,
        organizationId: organizationId(s.org.id),
        invoiceId: s.invoice.id,
        sessionId: `cs-${s.suffix}`,
        type: 'expired' as const,
        amountCents: 4200,
        currency: 'eur',
        paymentId: null,
      };
      expect(await repo.applyProviderEvent(late)).toBe('applied');
      const status = async (id: string) =>
        (
          await db
            .select({ status: checkoutSessions.status })
            .from(checkoutSessions)
            .where(eq(checkoutSessions.providerSessionId, id))
        )[0]?.status;
      expect(await status(`cs-${s.suffix}`)).toBe('paid');
      // Only the named session changed; the other checkout is still open.
      expect(await status(`cs-other-${s.suffix}`)).toBe('checkout_pending');
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, s.invoice.id));
      expect(invoice?.status).toBe('paid');
      // A failed or expired checkout can still turn paid when the money arrives later.
      await repo.applyProviderEvent({
        ...late,
        id: `evt-expired-b-${s.suffix}`,
        sessionId: `cs-other-${s.suffix}`,
      });
      expect(await status(`cs-other-${s.suffix}`)).toBe('expired');
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('rejects replays by event id, a second event for the same payment, and foreign organizations', async () => {
    const { db, pool } = await createDatabase(url!);
    const a = await seed(db, 'a');
    const b = await seed(db, 'b');
    try {
      const repo = createCheckoutRepository(db);
      const event = paid(a);
      expect(await repo.applyProviderEvent(event)).toBe('applied');
      expect(await repo.applyProviderEvent(event)).toBe('duplicate');
      // Stripe may deliver completed and async_succeeded as two events for one payment.
      expect(
        await repo.applyProviderEvent({
          ...event,
          id: `evt-second-${a.suffix}`,
        }),
      ).toBe('duplicate');
      // A signed event naming organization B but organization A's invoice finds nothing.
      expect(
        await repo.applyProviderEvent({
          ...paid(a),
          organizationId: organizationId(b.org.id),
        }),
      ).toBe('not_found');
      const ledgerA = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, a.invoice.id));
      const ledgerB = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, b.invoice.id));
      expect(ledgerA).toHaveLength(1);
      expect(ledgerA[0]?.method).toBe('online');
      expect(ledgerB).toHaveLength(0);
    } finally {
      await cleanup(db, a.org.id, b.org.id);
      await pool.end();
    }
  });

  it('books money that does not match the open amount and flags it instead of dropping the payment', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'mismatch');
    try {
      const repo = createCheckoutRepository(db);
      // A bank transfer of 12,00 arrived while the checkout for 42,00 was open.
      await db.insert(invoicePayments).values({
        organizationId: s.org.id,
        invoiceId: s.invoice.id,
        amountCents: 1200,
        actor: 'office',
        reason: 'Überweisung',
      });
      expect(await repo.applyProviderEvent(paid(s))).toBe(
        'applied_with_mismatch',
      );
      const rows = await db
        .select()
        .from(invoicePayments)
        .where(
          and(
            eq(invoicePayments.invoiceId, s.invoice.id),
            eq(invoicePayments.method, 'online'),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amountCents).toBe(4200);
      expect(rows[0]?.reason).toContain('weicht vom offenen Betrag ab');
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, s.invoice.id));
      expect(invoice?.status).toBe('paid');
      const manual = await db
        .select()
        .from(invoicePayments)
        .where(
          and(
            eq(invoicePayments.invoiceId, s.invoice.id),
            eq(invoicePayments.method, 'manual'),
          ),
        );
      expect(manual).toHaveLength(1);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('queues one payment confirmation mail per payment, in the organization locale', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'mail');
    try {
      const repo = createCheckoutRepository(db);
      const event = paid(s);
      await repo.applyProviderEvent(event);
      await repo.applyProviderEvent(event);
      const mails = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, s.org.id));
      expect(mails).toHaveLength(1);
      expect(mails[0]?.templateKey).toBe('payment-received');
      expect(mails[0]?.variables).toMatchObject({
        eventName: 'Bergpreis',
        amount: expect.stringContaining('42,00'),
        paymentReference: s.invoice.paymentReference,
        portalUrl: expect.stringMatching(/^\/events\/event-.*\/my-entry$/),
      });
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('merges the organization default with the event override for the online methods', async () => {
    const { db, pool } = await createDatabase(url!);
    const inherited = await seed(db, 'inherit', {
      orgConfig: { payments: { onlineMethods: ['card', 'sepa_debit'] } },
    });
    const overridden = await seed(db, 'override', {
      orgConfig: { payments: { onlineMethods: ['card', 'sepa_debit'] } },
      eventConfig: { payments: { onlineMethods: ['card'] } },
    });
    const disabled = await seed(db, 'disabled', {
      orgConfig: { payments: { onlineMethods: ['card'] } },
      eventConfig: { payments: { onlineMethods: [] } },
    });
    try {
      const repo = createCheckoutRepository(db);
      const methods = async (s: Awaited<ReturnType<typeof seed>>) =>
        (await repo.get(s.ctx, s.invoice.id))?.paymentMethods;
      expect(await methods(inherited)).toEqual(['card', 'sepa_debit']);
      expect(await methods(overridden)).toEqual(['card']);
      expect(await methods(disabled)).toEqual([]);
    } finally {
      await cleanup(db, inherited.org.id, overridden.org.id, disabled.org.id);
      await pool.end();
    }
  });

  it('reads the already paid amount from the ledger so a checkout charges only the open balance', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'balance');
    try {
      await db.insert(invoicePayments).values({
        organizationId: s.org.id,
        invoiceId: s.invoice.id,
        amountCents: 1200,
        actor: 'office',
        reason: 'Anzahlung',
      });
      const invoice = await createCheckoutRepository(db).get(
        s.ctx,
        s.invoice.id,
      );
      expect(invoice).toMatchObject({ totalCents: 4200, paidCents: 1200 });
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('exposes the newest unpaid checkout and counts sessions so a replacement gets a fresh key', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'pending');
    try {
      const repo = createCheckoutRepository(db);
      expect((await repo.get(s.ctx, s.invoice.id))?.pendingSession).toBeNull();
      await repo.createSession(s.ctx, s.invoice.id, {
        id: 'cs_old',
        url: 'https://checkout.test/old',
        amountCents: 4200,
        paymentMethods: ['card'],
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      const open = await repo.get(s.ctx, s.invoice.id);
      expect(open?.pendingSession).toMatchObject({
        id: 'cs_old',
        amountCents: 4200,
      });
      expect(open?.sessionCount).toBe(1);
      await repo.markSessionsExpired(s.ctx, s.invoice.id, ['cs_old']);
      const after = await repo.get(s.ctx, s.invoice.id);
      expect(after?.pendingSession).toBeNull();
      expect(after?.sessionCount).toBe(1);
      // An expiry instant in the past hides a session the provider no longer accepts.
      await repo.createSession(s.ctx, s.invoice.id, {
        id: 'cs_stale',
        url: 'https://checkout.test/stale',
        amountCents: 4200,
        paymentMethods: ['card'],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect((await repo.get(s.ctx, s.invoice.id))?.pendingSession).toBeNull();
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
});

describe.skipIf(!url)(
  'automatic refund after cancellation (PostgreSQL)',
  () => {
    const refundProvider = (calls: unknown[]): PaymentProvider => ({
      createCheckoutSession: async () => {
        throw new Error('unused');
      },
      expireCheckoutSession: async () => 'expired' as const,
      verifyWebhook: async () => null,
      refund: async (request) => {
        calls.push(request);
        return { id: `re_${request.idempotencyKey}` };
      },
    });
    const policy = {
      payments: {
        refundPolicy: {
          enabled: true,
          tiers: [
            { daysBefore: 28, percent: 100 },
            { daysBefore: 14, percent: 50 },
          ],
          rejectedPercent: 100,
        },
      },
    };

    it('refunds the configured share for a cancellation of the whole group and records it as online', async () => {
      const { db, pool } = await createDatabase(url!);
      const startsOn = new Date(Date.now() + 20 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const s = await seed(db, 'refund', { orgConfig: policy, startsOn });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        await db.transaction(async (tx) => {
          await tx
            .update(entries)
            .set({ acceptanceStatus: 'withdrawn' })
            .where(eq(entries.id, s.entries[0]!.id));
          await openRefundIntent(tx, s.org.id, s.entries[0]!.id, 'withdrawn');
        });
        const calls: Array<{ amountCents: number; idempotencyKey: string }> =
          [];
        const intents = createRefundIntentRepository(db);
        const result = await settleCancellationRefund(s.ctx, s.invoice.id, {
          intents,
          refunds: createPaymentRefundRepository(db),
          provider: refundProvider(calls) as PaymentProvider,
        });
        // 20 days before the event lies in the "from 14 days" tier: 50 %.
        expect(result).toEqual({
          status: 'done',
          percent: 50,
          refundedCents: 2100,
          failure: null,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.amountCents).toBe(2100);
        const ledger = await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, s.invoice.id));
        const refund = ledger.find((row) => row.amountCents < 0);
        expect(refund).toMatchObject({
          amountCents: -2100,
          method: 'online',
          actor: 'system:refund-policy',
        });
        const summary = await loadInvoiceSummaries(db, s.ctx, [s.group.id]);
        expect(summary.get(s.group.id)?.refundIntent).toMatchObject({
          status: 'done',
          percent: 50,
          refundedCents: 2100,
        });
        // Running it again changes nothing: the open intent is finished.
        expect(
          await settleCancellationRefund(s.ctx, s.invoice.id, {
            intents,
            refunds: createPaymentRefundRepository(db),
            provider: refundProvider(calls),
          }),
        ).toBeNull();
        expect(calls).toHaveLength(1);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });

    it('does nothing while another entry of the group is still active, or without an online payment', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'partial', {
        orgConfig: policy,
        entryCount: 2,
        startsOn: '2031-06-15',
      });
      const unpaid = await seed(db, 'unpaid', { orgConfig: policy });
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(s));
        const count = async (organization: string) =>
          (
            await db.execute(
              sql`select count(*)::int as n from payment_refund_intent where organization_id = ${organization}`,
            )
          ).rows[0] as { n: number };
        await db.transaction(async (tx) => {
          await tx
            .update(entries)
            .set({ acceptanceStatus: 'withdrawn' })
            .where(eq(entries.id, s.entries[0]!.id));
          await openRefundIntent(tx, s.org.id, s.entries[0]!.id, 'withdrawn');
        });
        expect((await count(s.org.id)).n).toBe(0);
        await db.transaction(async (tx) => {
          await tx
            .update(entries)
            .set({ acceptanceStatus: 'rejected' })
            .where(eq(entries.id, s.entries[1]!.id));
          await openRefundIntent(tx, s.org.id, s.entries[1]!.id, 'rejected');
        });
        expect((await count(s.org.id)).n).toBe(1);
        await db.transaction(async (tx) => {
          await tx
            .update(entries)
            .set({ acceptanceStatus: 'withdrawn' })
            .where(eq(entries.id, unpaid.entries[0]!.id));
          await openRefundIntent(
            tx,
            unpaid.org.id,
            unpaid.entries[0]!.id,
            'withdrawn',
          );
        });
        expect((await count(unpaid.org.id)).n).toBe(0);
      } finally {
        await cleanup(db, s.org.id, unpaid.org.id);
        await pool.end();
      }
    });

    it('keeps a failed provider refund visible on the invoice and refunds nothing outside the rule', async () => {
      const { db, pool } = await createDatabase(url!);
      const late = await seed(db, 'late', {
        orgConfig: policy,
        startsOn: new Date(Date.now() + 3 * 86_400_000)
          .toISOString()
          .slice(0, 10),
      });
      const broken = await seed(db, 'broken', {
        orgConfig: policy,
        startsOn: '2032-06-15',
      });
      try {
        const repo = createCheckoutRepository(db);
        await repo.applyProviderEvent(paid(late));
        await repo.applyProviderEvent(paid(broken));
        for (const s of [late, broken])
          await db.transaction(async (tx) => {
            await tx
              .update(entries)
              .set({ acceptanceStatus: 'withdrawn' })
              .where(eq(entries.id, s.entries[0]!.id));
            await openRefundIntent(tx, s.org.id, s.entries[0]!.id, 'withdrawn');
          });
        const calls: unknown[] = [];
        const deps = {
          intents: createRefundIntentRepository(db),
          refunds: createPaymentRefundRepository(db),
        };
        // Three days before the event no tier applies: nothing is refunded.
        expect(
          await settleCancellationRefund(late.ctx, late.invoice.id, {
            ...deps,
            provider: refundProvider(calls),
          }),
        ).toMatchObject({ status: 'skipped', percent: 0, refundedCents: 0 });
        expect(calls).toHaveLength(0);
        const failing: PaymentProvider = {
          ...refundProvider([]),
          refund: async () => {
            throw new Error('stripe unreachable');
          },
        };
        expect(
          await settleCancellationRefund(broken.ctx, broken.invoice.id, {
            ...deps,
            provider: failing,
          }),
        ).toMatchObject({ status: 'failed', failure: 'provider_unavailable' });
        const summary = await loadInvoiceSummaries(db, broken.ctx, [
          broken.group.id,
        ]);
        expect(summary.get(broken.group.id)?.refundIntent).toMatchObject({
          status: 'failed',
          failure: 'provider_unavailable',
        });
        // The payment is still fully refundable by hand.
        expect(summary.get(broken.group.id)?.providerPayments).toEqual([
          expect.objectContaining({ refundableCents: 4200 }),
        ]);
      } finally {
        await cleanup(db, late.org.id, broken.org.id);
        await pool.end();
      }
    });
  },
);

describe.skipIf(!url)(
  'confirmation mail after verification (PostgreSQL)',
  () => {
    it('sends one confirmation with the open amount and the pay-later link, and says "paid" once paid', async () => {
      const { db, pool } = await createDatabase(url!);
      const open = await seed(db, 'confirm-open');
      const settled = await seed(db, 'confirm-paid');
      try {
        await createCheckoutRepository(db).applyProviderEvent(paid(settled));
        const verify = async (s: Awaited<ReturnType<typeof seed>>) => {
          const token = `token-${s.suffix}`;
          await db.insert(groupEmailVerifications).values({
            organizationId: s.org.id,
            eventId: s.event.id,
            registrationGroupId: s.group.id,
            tokenHash: `hash-${token}`,
            expiresAt: new Date(Date.now() + 3_600_000),
          });
          const methods = createRegistrationVerificationMethods({
            db,
            options: {},
            canonicalOrigin: (async () =>
              'https://nennbox.example.test') as never,
            hashToken: (value) => `hash-${value}`,
          });
          expect(await methods.verify(s.ctx, token)).toBe(true);
        };
        await verify(open);
        await verify(settled);
        const mailOf = async (s: Awaited<ReturnType<typeof seed>>) =>
          (
            await db
              .select()
              .from(emailOutbox)
              .where(
                and(
                  eq(emailOutbox.organizationId, s.org.id),
                  eq(emailOutbox.templateKey, 'entry-received'),
                ),
              )
          ).map((row) => row.variables);
        const openMails = await mailOf(open);
        expect(openMails).toHaveLength(1);
        expect(openMails[0]).toMatchObject({
          eventName: 'Bergpreis',
          paymentSummary: expect.stringContaining('Offener Betrag: 42,00'),
          portalUrl: expect.stringMatching(/^\/events\/event-.*\/my-entry$/),
        });
        const settledMails = await mailOf(settled);
        expect(settledMails).toHaveLength(1);
        expect(settledMails[0]).toMatchObject({
          paymentSummary: 'Die Startgebühr ist bezahlt.',
        });
      } finally {
        await cleanup(db, open.org.id, settled.org.id);
        await pool.end();
      }
    });
  },
);

describe.skipIf(!url)('concurrent payment paths (PostgreSQL)', () => {
  const expiredEvent = (s: Awaited<ReturnType<typeof seed>>) => ({
    id: `evt-expired-${crypto.randomUUID()}`,
    organizationId: organizationId(s.org.id),
    invoiceId: s.invoice.id,
    sessionId: `cs-${s.suffix}`,
    type: 'expired' as const,
    amountCents: 4200,
    currency: 'eur',
    paymentId: null,
  });
  const sessionStatus = async (
    db: Awaited<ReturnType<typeof createDatabase>>['db'],
    id: string,
  ) =>
    (
      await db
        .select({ status: checkoutSessions.status })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.providerSessionId, id))
    )[0]?.status;

  it('ends with the session paid and one ledger entry when "paid" and "expired" arrive at the same time, in either order', async () => {
    const { db, pool } = await createDatabase(url!);
    const first = await seed(db, 'race-a');
    const second = await seed(db, 'race-b');
    try {
      const repo = createCheckoutRepository(db);
      for (const s of [first, second])
        await repo.createSession(s.ctx, s.invoice.id, {
          id: `cs-${s.suffix}`,
          url: 'https://checkout.test/x',
          amountCents: 4200,
          paymentMethods: ['card'],
          expiresAt: null,
        });
      await Promise.all([
        repo.applyProviderEvent(paid(first)),
        repo.applyProviderEvent(expiredEvent(first)),
      ]);
      await Promise.all([
        repo.applyProviderEvent(expiredEvent(second)),
        repo.applyProviderEvent(paid(second)),
      ]);
      for (const s of [first, second]) {
        expect(await sessionStatus(db, `cs-${s.suffix}`)).toBe('paid');
        expect(
          await db
            .select()
            .from(invoicePayments)
            .where(eq(invoicePayments.invoiceId, s.invoice.id)),
        ).toHaveLength(1);
      }
    } finally {
      await cleanup(db, first.org.id, second.org.id);
      await pool.end();
    }
  });

  it('applies one event exactly once when the same event id is delivered in parallel', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'parallel-dup');
    try {
      const repo = createCheckoutRepository(db);
      const event = paid(s);
      const results = await Promise.all([
        repo.applyProviderEvent(event),
        repo.applyProviderEvent(event),
        repo.applyProviderEvent(event),
      ]);
      expect(results.filter((result) => result === 'applied')).toHaveLength(1);
      expect(results.filter((result) => result === 'duplicate')).toHaveLength(
        2,
      );
      expect(
        await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, s.invoice.id)),
      ).toHaveLength(1);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('stores one session when a double click creates the same provider session twice', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'double-click');
    try {
      const repo = createCheckoutRepository(db);
      const session = {
        id: `cs-${s.suffix}`,
        url: 'https://checkout.test/same',
        amountCents: 4200,
        paymentMethods: ['card', 'sepa_debit'] as ('card' | 'sepa_debit')[],
        expiresAt: null,
      };
      await Promise.all([
        repo.createSession(s.ctx, s.invoice.id, session),
        repo.createSession(s.ctx, s.invoice.id, session),
      ]);
      const open = (await repo.get(s.ctx, s.invoice.id))!.openSessions;
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({
        amountCents: 4200,
        paymentMethods: ['card', 'sepa_debit'],
      });
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('answers a duplicate provider refund id with "duplicate" instead of failing on the unique key', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'refund-race');
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      const refunds = createPaymentRefundRepository(db);
      const input = {
        invoiceId: s.invoice.id,
        providerPaymentId: `pi-${s.suffix}`,
        refundableCents: 4200,
        currency: 'EUR',
        amountCents: 1000,
        providerRefundId: `re-${s.suffix}`,
        actor: 'tester',
        reason: 'doppelt ausgelöst',
      };
      const results = await Promise.all([
        refunds.recordRefund(s.ctx, input),
        refunds.recordRefund(s.ctx, input),
        refunds.recordRefund(s.ctx, input),
      ]);
      expect(results.filter((result) => result === 'recorded')).toHaveLength(1);
      expect(results.filter((result) => result === 'duplicate')).toHaveLength(
        2,
      );
      const refundsInLedger = (
        await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, s.invoice.id))
      ).filter((row) => row.amountCents < 0);
      expect(refundsInLedger).toHaveLength(1);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('queues exactly one refund intent when the last two entries are withdrawn at the same time', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'last-two', {
      orgConfig: { payments: { refundPolicy: refundRule } },
      entryCount: 2,
    });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      // Both transactions have written their status change before either one counts
      // the remaining entries; only the invoice lock lets the second one see the first.
      let ready = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const withdraw = (entryId: string) =>
        db.transaction(async (tx) => {
          await tx
            .update(entries)
            .set({ acceptanceStatus: 'withdrawn' })
            .where(eq(entries.id, entryId));
          if (++ready === 2) release();
          await gate;
          await openRefundIntent(tx, s.org.id, entryId, 'withdrawn');
        });
      await Promise.all(s.entries.map((entry) => withdraw(entry.id)));
      const intents = await db
        .select()
        .from(paymentRefundIntents)
        .where(eq(paymentRefundIntents.organizationId, s.org.id));
      expect(intents).toHaveLength(1);
      expect(intents[0]?.status).toBe('pending');
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
});

const refundRule = {
  enabled: true,
  tiers: [{ daysBefore: 0, percent: 50 }],
  rejectedPercent: 100,
};

describe.skipIf(!url)('refund intents (PostgreSQL)', () => {
  const cancelAll = async (
    db: Awaited<ReturnType<typeof createDatabase>>['db'],
    s: Awaited<ReturnType<typeof seed>>,
  ) =>
    db.transaction(async (tx) => {
      for (const entry of s.entries)
        await tx
          .update(entries)
          .set({ acceptanceStatus: 'withdrawn' })
          .where(eq(entries.id, entry.id));
      await openRefundIntent(tx, s.org.id, s.entries[0]!.id, 'withdrawn');
    });
  const provider = (calls: unknown[]) =>
    ({
      refund: async (request: { idempotencyKey: string }) => {
        calls.push(request);
        return { id: `re_${request.idempotencyKey}` };
      },
    }) as unknown as PaymentProvider;

  it('hands one intent to exactly one of several parallel claimers and marks it in progress', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'claim', {
      orgConfig: { payments: { refundPolicy: refundRule } },
      startsOn: '2035-06-15',
    });
    try {
      await createCheckoutRepository(db).applyProviderEvent(paid(s));
      await cancelAll(db, s);
      const intents = createRefundIntentRepository(db);
      const claims = await Promise.all([
        intents.claim(s.ctx, s.invoice.id),
        intents.claim(s.ctx, s.invoice.id),
        intents.claim(s.ctx, s.invoice.id),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const [row] = await db
        .select()
        .from(paymentRefundIntents)
        .where(eq(paymentRefundIntents.organizationId, s.org.id));
      expect(row?.status).toBe('processing');
      expect(row?.claimedAt).toBeInstanceOf(Date);
      // While the holder is working, nobody takes it over.
      expect(await intents.claim(s.ctx, s.invoice.id)).toBeNull();
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('lets a retry take over an intent that stayed pending or in progress past the delay, for its own organization only', async () => {
    const { db, pool } = await createDatabase(url!);
    const a = await seed(db, 'retry-a', {
      orgConfig: { payments: { refundPolicy: refundRule } },
      startsOn: '2035-06-15',
    });
    const b = await seed(db, 'retry-b', {
      orgConfig: { payments: { refundPolicy: refundRule } },
      startsOn: '2035-06-15',
    });
    try {
      const checkouts = createCheckoutRepository(db);
      for (const s of [a, b]) {
        await checkouts.applyProviderEvent(paid(s));
        await cancelAll(db, s);
      }
      const intents = createRefundIntentRepository(db, {
        retryAfterMs: 60_000,
      });
      // Fresh intents are not stale yet.
      expect(await intents.staleInvoiceIds(a.ctx)).toEqual([]);
      // A took by a worker that died: processing for 11 minutes. B is merely old and pending.
      await intents.claim(a.ctx, a.invoice.id);
      await db.execute(
        sql`update payment_refund_intent set claimed_at = now() - interval '11 minutes' where organization_id = ${a.org.id}`,
      );
      await db.execute(
        sql`update payment_refund_intent set created_at = now() - interval '11 minutes' where organization_id = ${b.org.id}`,
      );
      expect(await intents.staleInvoiceIds(a.ctx)).toEqual([a.invoice.id]);
      expect(await intents.staleInvoiceIds(b.ctx)).toEqual([b.invoice.id]);
      const calls: Array<{ organizationId: string }> = [];
      for (const s of [a, b]) {
        const result = await settleCancellationRefund(s.ctx, s.invoice.id, {
          intents,
          refunds: createPaymentRefundRepository(db),
          provider: provider(calls),
        });
        expect(result).toMatchObject({ status: 'done', refundedCents: 2100 });
      }
      expect(calls.map((call) => call.organizationId).sort()).toEqual(
        [a.org.id, b.org.id].sort(),
      );
      expect(await intents.staleInvoiceIds(a.ctx)).toEqual([]);
    } finally {
      await cleanup(db, a.org.id, b.org.id);
      await pool.end();
    }
  });

  it('gives back nothing more when half was already refunded by hand and the rule says 50 %', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'manual-first', {
      totalCents: 10_000,
      orgConfig: { payments: { refundPolicy: refundRule } },
      startsOn: '2035-06-15',
    });
    try {
      await createCheckoutRepository(db).applyProviderEvent(
        paid(s, { amountCents: 10_000 }),
      );
      const refunds = createPaymentRefundRepository(db);
      expect(
        await refunds.recordRefund(s.ctx, {
          invoiceId: s.invoice.id,
          providerPaymentId: `pi-${s.suffix}`,
          refundableCents: 10_000,
          currency: 'EUR',
          amountCents: 5_000,
          providerRefundId: `re-manual-${s.suffix}`,
          actor: 'admin',
          reason: 'Kulanz',
        }),
      ).toBe('recorded');
      await cancelAll(db, s);
      const calls: unknown[] = [];
      const result = await settleCancellationRefund(s.ctx, s.invoice.id, {
        intents: createRefundIntentRepository(db),
        refunds,
        provider: provider(calls),
      });
      expect(result).toEqual({
        status: 'done',
        percent: 50,
        refundedCents: 0,
        failure: null,
      });
      expect(calls).toHaveLength(0);
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });

  it('reports a registration as cancelled for checkout only once every entry is withdrawn', async () => {
    const { db, pool } = await createDatabase(url!);
    const s = await seed(db, 'cancelled-flag', { entryCount: 2 });
    try {
      const repo = createCheckoutRepository(db);
      expect((await repo.get(s.ctx, s.invoice.id))?.allEntriesCancelled).toBe(
        false,
      );
      await db
        .update(entries)
        .set({ acceptanceStatus: 'withdrawn' })
        .where(eq(entries.id, s.entries[0]!.id));
      expect((await repo.get(s.ctx, s.invoice.id))?.allEntriesCancelled).toBe(
        false,
      );
      await db
        .update(entries)
        .set({ acceptanceStatus: 'rejected' })
        .where(eq(entries.id, s.entries[1]!.id));
      expect((await repo.get(s.ctx, s.invoice.id))?.allEntriesCancelled).toBe(
        true,
      );
    } finally {
      await cleanup(db, s.org.id);
      await pool.end();
    }
  });
});

describe.skipIf(!url)(
  'review regressions: checkout and cancellation serialization',
  () => {
    it('serializes independent checkout creators on PostgreSQL and reuses the single stored session', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'serialized-checkout');
      try {
        const repo = createCheckoutRepository(db);
        let created = 0;
        const start = () =>
          repo.withInvoiceLock!(s.ctx, s.invoice.id, async (locked) => {
            const invoice = (await locked.get(s.ctx, s.invoice.id))!;
            if (invoice.pendingSession) return invoice.pendingSession.id;
            const id = `cs-${s.suffix}-${++created}`;
            await locked.createSession(s.ctx, s.invoice.id, {
              id,
              url: 'https://checkout.test/one',
              amountCents: 4200,
              paymentMethods: ['card'],
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            });
            return id;
          });
        expect(
          new Set(await Promise.all([start(), start(), start()])).size,
        ).toBe(1);
        expect(created).toBe(1);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });

    it('excludes elapsed sessions from reusable checkout and expires them by signed provider event', async () => {
      const { db, pool } = await createDatabase(url!);
      const s = await seed(db, 'expiry', {
        orgConfig: { payments: { checkoutLifetimeMinutes: 90 } },
        eventConfig: { payments: { checkoutLifetimeMinutes: 30 } },
      });
      try {
        const repo = createCheckoutRepository(db);
        await repo.createSession(s.ctx, s.invoice.id, {
          id: `cs-${s.suffix}`,
          url: 'https://checkout.test/old',
          amountCents: 4200,
          paymentMethods: ['card'],
          expiresAt: new Date(Date.now() - 60000).toISOString(),
        });
        expect(await repo.get(s.ctx, s.invoice.id)).toMatchObject({
          pendingSession: null,
          checkoutLifetimeMinutes: 30,
        });
        await repo.applyProviderEvent({
          ...paid(s),
          id: `evt-exp-${s.suffix}`,
          type: 'expired',
          paymentId: null,
        });
        expect(
          (await repo.get(s.ctx, s.invoice.id))!.openSessions,
        ).toHaveLength(0);
      } finally {
        await cleanup(db, s.org.id);
        await pool.end();
      }
    });

    it.each(['before', 'parallel'] as const)(
      'makes payment %s cancellation visible for refund instead of silently accepting it',
      async (order) => {
        const { db, pool } = await createDatabase(url!);
        const s = await seed(db, `cancel-race-${order}`);
        try {
          const cancel = () =>
            db.transaction(async (tx) => {
              await tx
                .update(entries)
                .set({ acceptanceStatus: 'withdrawn' })
                .where(eq(entries.id, s.entries[0]!.id));
              await openRefundIntent(
                tx,
                s.org.id,
                s.entries[0]!.id,
                'withdrawn',
              );
            });
          const pay = () =>
            createCheckoutRepository(db).applyProviderEvent(paid(s));
          if (order === 'before') {
            await cancel();
            await pay();
          } else await Promise.all([cancel(), pay()]);
          const intents = await db
            .select()
            .from(paymentRefundIntents)
            .where(eq(paymentRefundIntents.invoiceId, s.invoice.id));
          expect(intents).toHaveLength(1);
          expect(['pending', 'failed']).toContain(intents[0]!.status);
          if (order === 'before')
            expect(intents[0]).toMatchObject({
              status: 'failed',
              failure: 'payment_after_cancellation',
            });
          expect(
            await createCheckoutRepository(db).get(s.ctx, s.invoice.id),
          ).toMatchObject({ allEntriesCancelled: true, paidCents: 4200 });
        } finally {
          await cleanup(db, s.org.id);
          await pool.end();
        }
      },
    );
  },
);
