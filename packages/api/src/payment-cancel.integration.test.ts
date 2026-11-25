import { eq, inArray } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checkoutSessions,
  createDatabase,
  emailOutbox,
  entries,
  eventClasses,
  events,
  getOrganizationMailConfiguration,
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
  type RequestContext,
} from '@nennbox/core';
import { createProductApi } from './product.js';
import type { ContextResolvers } from './types.js';

const databaseUrl = process.env.NENNBOX_TEST_DATABASE_URL;
const remote = { incoming: { socket: { remoteAddress: '203.0.113.7' } } };

type Tenant = {
  id: string;
  origin: string;
  email: string;
  sessionId: string;
  invoiceId: string;
};

describe.skipIf(!databaseUrl)(
  'driver portal "Zahlung abbrechen" with two organizations',
  { timeout: 60_000 },
  () => {
    let db: Database;
    let end: () => Promise<void>;
    let app: Hono;
    let tenants: { a: Tenant; b: Tenant };
    const expire = vi.fn<
      (request: {
        organizationId: string;
        sessionId: string;
      }) => Promise<'expired' | 'completed'>
    >(async () => 'expired');

    beforeAll(async () => {
      await migrate(databaseUrl!);
      await runMigrations({ connectionString: databaseUrl! });
      const created = await createDatabase(databaseUrl!);
      db = created.db;
      end = () => created.pool.end();
      const suffix = crypto.randomUUID().slice(0, 8);
      // Both organizations use the same event slug and the same session ids per
      // pattern: only the organization decides what a request may touch.
      const make = async (key: 'a' | 'b'): Promise<Tenant> => {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `cancel-${key}-${suffix}`,
            name: `Cancel ${key}`,
            timezone: 'UTC',
            locale: 'de',
            currency: 'EUR',
            mailFrom: `club-${key}@example.test`,
          })
          .returning();
        const [event] = await db
          .insert(events)
          .values({
            organizationId: org!.id,
            slug: 'rallye',
            name: 'Rallye',
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
        const email = `driver-${key}-${suffix}@example.test`;
        const [person] = await db
          .insert(people)
          .values({
            organizationId: org!.id,
            firstName: 'Ada',
            lastName: key,
            email,
          })
          .returning();
        const [vehicle] = await db
          .insert(vehicles)
          .values({ organizationId: org!.id, make: 'Porsche', model: '911' })
          .returning();
        const [group] = await db
          .insert(registrationGroups)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            personId: person!.id,
            contactEmail: email,
          })
          .returning();
        await db.insert(entries).values({
          orgaCode: `C-${crypto.randomUUID()}`,
          organizationId: org!.id,
          eventId: event!.id,
          classId: klass!.id,
          registrationGroupId: group!.id,
          driverPersonId: person!.id,
          vehicleId: vehicle!.id,
          verificationStatus: 'verified',
        });
        const [invoice] = await db
          .insert(invoices)
          .values({
            organizationId: org!.id,
            eventId: event!.id,
            registrationGroupId: group!.id,
            totalCents: 4200,
            currency: 'EUR',
            paymentReference: `RF-${key}-${suffix}`,
          })
          .returning();
        const sessionId = `cs_${key}_${suffix}`;
        await db.insert(checkoutSessions).values({
          organizationId: org!.id,
          invoiceId: invoice!.id,
          provider: 'stripe',
          providerSessionId: sessionId,
          url: `https://checkout.test/${sessionId}`,
          amountCents: 4200,
          paymentMethods: ['card'],
        });
        return {
          id: org!.id,
          origin: `https://${key}-${suffix}.example.test`,
          email,
          sessionId,
          invoiceId: invoice!.id,
        };
      };
      tenants = { a: await make('a'), b: await make('b') };
      const byId = new Map(
        [tenants.a, tenants.b].map((tenant) => [tenant.id, tenant]),
      );
      const resolve =
        () =>
        async (request: Request): Promise<RequestContext | null> => {
          const id = request.headers.get('x-test-tenant');
          if (!id || !byId.has(id)) return null;
          return createRequestContext({
            deploymentMode: 'cloud',
            organizationId: organizationId(id),
            permissions: new Set(),
            capabilities: new Set(),
            correlationId: crypto.randomUUID(),
          });
        };
      const contexts: ContextResolvers = {
        public: resolve(),
        member: resolve(),
      };
      const paymentProvider = {
        createCheckoutSession: async () => {
          throw new Error('unused');
        },
        expireCheckoutSession: expire,
        verifyWebhook: async () => null,
        refund: async () => ({ id: 're_unused' }),
      } as unknown as PaymentProvider;
      const origin = async (tenant: { organizationId: string }) =>
        byId.get(tenant.organizationId)?.origin ?? null;
      app = createProductApi({
        db,
        edition: { deploymentMode: 'cloud', contexts },
        canonicalOrigin: origin,
        paymentReturnOrigin: origin,
        paymentProvider,
        mail: {
          configuration: (tenant) =>
            getOrganizationMailConfiguration(db, tenant.organizationId),
        },
      });
    });

    afterAll(async () => {
      if (!db) return;
      try {
        const ids = [tenants.a.id, tenants.b.id];
        await db
          .delete(emailOutbox)
          .where(inArray(emailOutbox.organizationId, ids));
        await db.delete(events).where(inArray(events.organizationId, ids));
        await db.delete(organizations).where(inArray(organizations.id, ids));
      } finally {
        await end();
      }
    });

    const request = (
      tenant: Tenant,
      method: string,
      path: string,
      body?: unknown,
      cookie?: string,
    ) =>
      app.request(
        path,
        {
          method,
          headers: {
            'x-test-tenant': tenant.id,
            ...(cookie ? { cookie } : {}),
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        remote,
      );

    const signIn = async (tenant: Tenant): Promise<string> => {
      expect(
        (
          await request(tenant, 'POST', '/public/driver-portal/request', {
            eventSlug: 'rallye',
            email: tenant.email,
          })
        ).status,
      ).toBe(200);
      const [mail] = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, tenant.id));
      const token = new URLSearchParams(
        new URL(String(mail?.variables.linkUrl)).hash.slice(1),
      ).get('token')!;
      const redeemed = await request(
        tenant,
        'POST',
        '/public/driver-portal/redeem',
        { token },
      );
      expect(redeemed.status).toBe(200);
      return redeemed.headers.get('set-cookie')!.split(';')[0]!;
    };
    const statusOf = async (sessionId: string) =>
      (
        await db
          .select({ status: checkoutSessions.status })
          .from(checkoutSessions)
          .where(eq(checkoutSessions.providerSessionId, sessionId))
      )[0]?.status;
    const cancel = (tenant: Tenant, cookie: string) =>
      request(
        tenant,
        'POST',
        '/public/driver-portal/payment/cancel',
        undefined,
        cookie,
      );

    it('ends only the checkout of the signed-in organization, and never one of another', async () => {
      const { a, b } = tenants;
      const cookieA = await signIn(a);
      const cookieB = await signIn(b);
      // The portal marks the open checkout so the driver can resume or cancel it.
      const view = await (
        await request(a, 'GET', '/public/driver-portal', undefined, cookieA)
      ).json();
      expect(view.payment.checkoutPending).toBe(true);
      expect(view.payment.invoiceId).toBe(a.invoiceId);

      // A session of organization A presented to organization B reaches nothing.
      expect((await cancel(b, cookieA)).status).toBe(404);
      expect(expire).not.toHaveBeenCalled();
      expect(await statusOf(a.sessionId)).toBe('checkout_pending');
      expect(await statusOf(b.sessionId)).toBe('checkout_pending');

      expect((await cancel(a, cookieA)).status).toBe(200);
      expect(expire.mock.calls.map(([call]) => call)).toEqual([
        { organizationId: a.id, sessionId: a.sessionId },
      ]);
      expect(await statusOf(a.sessionId)).toBe('expired');
      expect(await statusOf(b.sessionId)).toBe('checkout_pending');

      // Nothing left to cancel for A; B is unaffected and cancels its own.
      expect((await cancel(a, cookieA)).status).toBe(404);
      expect(expire).toHaveBeenCalledTimes(1);
      expect((await cancel(b, cookieB)).status).toBe(200);
      expect(expire.mock.calls.at(-1)![0]).toEqual({
        organizationId: b.id,
        sessionId: b.sessionId,
      });
      expect(await statusOf(b.sessionId)).toBe('expired');
    });
  },
);
