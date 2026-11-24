import { eq } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checkoutSessions,
  createCheckoutRepository,
  createDatabase,
  entries,
  eventClasses,
  events,
  invoices,
  migrate,
  organizations,
  people,
  registrationGroups,
  vehicles,
  type Database,
} from '@nennbox/adapter-postgres';
import {
  createRequestContext,
  organizationId,
  type PaymentProvider,
} from '@nennbox/core';
import { createInvoiceCheckout } from './routes/invoice-checkout.js';
import type { ApiDeps } from './types.js';

const databaseUrl = process.env.NENNBOX_TEST_DATABASE_URL;

async function seed(db: Database, suffix: string) {
  const [org] = await db
    .insert(organizations)
    .values({
      slug: `checkout-lock-${suffix}`,
      name: 'Checkout serialization',
      timezone: 'UTC',
      locale: 'de',
      currency: 'EUR',
      registrationFormConfig: { payments: { onlineMethods: ['card'] } },
    })
    .returning();
  const [event] = await db
    .insert(events)
    .values({
      organizationId: org!.id,
      slug: `race-${suffix}`,
      name: 'Race',
      startsOn: '2035-06-01',
      endsOn: '2035-06-02',
      status: 'open',
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
    .values({
      organizationId: org!.id,
      firstName: 'Ada',
      lastName: 'Driver',
    })
    .returning();
  const [vehicle] = await db
    .insert(vehicles)
    .values({
      organizationId: org!.id,
      make: 'Honda',
      model: 'RS',
    })
    .returning();
  const [group] = await db
    .insert(registrationGroups)
    .values({
      organizationId: org!.id,
      eventId: event!.id,
      personId: person!.id,
    })
    .returning();
  await db.insert(entries).values({
    orgaCode: `LOCK-${suffix}`,
    organizationId: org!.id,
    eventId: event!.id,
    classId: klass!.id,
    registrationGroupId: group!.id,
    driverPersonId: person!.id,
    vehicleId: vehicle!.id,
  });
  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: org!.id,
      eventId: event!.id,
      registrationGroupId: group!.id,
      totalCents: 4200,
      currency: 'EUR',
      paymentReference: `LOCK-${suffix}`,
    })
    .returning();
  return { org: org!, event: event!, invoice: invoice! };
}

describe.skipIf(!databaseUrl)(
  'productive invoice checkout serialization (PostgreSQL)',
  () => {
    beforeAll(async () => {
      await migrate(databaseUrl!);
      await runMigrations({ connectionString: databaseUrl! });
    });

    it('holds the invoice row lock across the provider call and reuses the committed checkout across independent creators', async () => {
      const suffix = crypto.randomUUID();
      const applicationName = (name: string) => {
        const url = new URL(databaseUrl!);
        url.searchParams.set('application_name', `checkout-${name}-${suffix}`);
        return url.toString();
      };
      // Separate pools model separate API processes; the observer never participates
      // in the checkout transactions and can see which backend is actually blocked.
      const observer = await createDatabase(databaseUrl!);
      const first = await createDatabase(applicationName('first'));
      const second = await createDatabase(applicationName('second'));
      let releaseProvider!: () => void;
      const providerReleased = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      const requests: ReturnType<typeof createInvoiceCheckout>[] = [];
      let fixture: Awaited<ReturnType<typeof seed>> | undefined;
      let providerCalls = 0;
      const createSession = vi.fn<PaymentProvider['createCheckoutSession']>(
        async () => {
          const number = ++providerCalls;
          // Keep every provider invocation open until the test has observed either
          // real DB contention or a second invocation slipping past the protection.
          await providerReleased;
          return {
            id: `cs-${suffix}-${number}`,
            url: `https://checkout.test/${suffix}/${number}`,
          };
        },
      );
      const expireSession = vi.fn<PaymentProvider['expireCheckoutSession']>(
        async () => 'expired',
      );
      const warn = vi.fn();
      try {
        fixture = await seed(observer.db, suffix);
        const { org, invoice } = fixture;
        const ctx = createRequestContext({
          deploymentMode: 'cloud',
          organizationId: organizationId(org.id),
          permissions: new Set(['payment:write']),
          capabilities: new Set(),
          correlationId: suffix,
        });
        const provider: PaymentProvider = {
          createCheckoutSession: createSession,
          expireCheckoutSession: expireSession,
          verifyWebhook: async () => null,
          refund: async () => {
            throw new Error('Unexpected refund');
          },
        };
        const start = (db: Database) =>
          createInvoiceCheckout(
            {
              // This helper uses only these ports. Neither the repository, its lock,
              // nor the productive API entry point is replaced with a test algorithm.
              checkoutRepository: createCheckoutRepository(db),
              paymentProvider: provider,
              paymentReturnOrigin: async () => 'https://nennbox.example.test',
              logger: { info() {}, error() {}, warn },
            } as unknown as ApiDeps,
            ctx,
            invoice.id,
            (slug) => `/events/${slug}`,
          );

        requests.push(start(first.db));
        await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
        requests.push(start(second.db));

        // No timing-only "sleep then release": release only once PostgreSQL proves
        // the second backend is waiting on the first, or a lock mutation lets the
        // second provider call through. A missing/unfinished second request times out.
        let blocked = false;
        await vi.waitFor(
          async () => {
            const result = await observer.pool.query<{ blocked: boolean }>(
              `
          select exists (
            select 1 from pg_stat_activity waiting
            join pg_stat_activity holding
              on holding.pid = any(pg_blocking_pids(waiting.pid))
            where waiting.application_name = $1
              and holding.application_name = $2
              and waiting.wait_event_type = 'Lock'
          ) as blocked
        `,
              [`checkout-second-${suffix}`, `checkout-first-${suffix}`],
            );
            blocked = result.rows[0]!.blocked;
            expect(blocked || createSession.mock.calls.length > 1).toBe(true);
          },
          { timeout: 5000, interval: 10 },
        );

        releaseProvider();
        const results = await Promise.all(requests);
        const stored = await observer.db
          .select()
          .from(checkoutSessions)
          .where(eq(checkoutSessions.invoiceId, invoice.id));

        expect
          .soft(blocked, 'second API process must wait on the invoice row')
          .toBe(true);
        expect.soft(createSession).toHaveBeenCalledTimes(1);
        expect.soft(stored).toHaveLength(1);
        expect.soft(results).toEqual([
          { status: 201, url: `https://checkout.test/${suffix}/1` },
          { status: 201, url: `https://checkout.test/${suffix}/1` },
        ]);
        expect.soft(stored[0]).toMatchObject({
          providerSessionId: `cs-${suffix}-1`,
          status: 'checkout_pending',
          amountCents: 4200,
          paymentMethods: ['card'],
        });
        expect(expireSession).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        // Release and join before deleting fixtures/closing pools, even if an
        // assertion fails: a failed race test must not leave a hanging transaction.
        releaseProvider();
        await Promise.allSettled(requests);
        try {
          if (fixture) {
            await observer.db
              .delete(events)
              .where(eq(events.id, fixture.event.id));
            await observer.db
              .delete(organizations)
              .where(eq(organizations.id, fixture.org.id));
          }
        } finally {
          await Promise.all([
            first.pool.end(),
            second.pool.end(),
            observer.pool.end(),
          ]);
        }
      }
    }, 15_000);
  },
);
