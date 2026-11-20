import { and, eq, inArray } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { describe, expect, it } from 'vitest';
import { organizationId, createRequestContext } from '@nennbox/core';
import { createDatabase, migrate } from './database-service.js';
import { createCheckoutRepository } from './payment-checkouts.js';
import { createPaymentRefundRepository } from './payment-refunds.js';
import { organizations, events } from './schema/organization.js';
import { people, registrationGroups } from './schema/entries.js';
import {
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL payment checkout repository', () => {
  it('isolates webhook orgs and applies successful provider events exactly once with audit', async () => {
    await migrate(url!);
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const createdOrganizations: string[] = [];
    let createdEventId: string | undefined;
    try {
      const [orgA] = await db
        .insert(organizations)
        .values({
          slug: `pay-a-${suffix}`,
          name: 'Payment A',
          timezone: 'UTC',
          locale: 'en',
          currency: 'EUR',
        })
        .returning();
      const [orgB] = await db
        .insert(organizations)
        .values({
          slug: `pay-b-${suffix}`,
          name: 'Payment B',
          timezone: 'UTC',
          locale: 'en',
          currency: 'EUR',
        })
        .returning();
      createdOrganizations.push(orgA!.id, orgB!.id);
      const [event] = await db
        .insert(events)
        .values({
          organizationId: orgA!.id,
          slug: `event-${suffix}`,
          name: 'Race',
          startsOn: '2030-01-01',
          endsOn: '2030-01-02',
          status: 'open',
        })
        .returning();
      createdEventId = event!.id;
      const [person] = await db
        .insert(people)
        .values({
          organizationId: orgA!.id,
          firstName: 'Ada',
          lastName: 'Driver',
        })
        .returning();
      const [group] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgA!.id,
          eventId: event!.id,
          personId: person!.id,
        })
        .returning();
      const [invoice] = await db
        .insert(invoices)
        .values({
          organizationId: orgA!.id,
          eventId: event!.id,
          registrationGroupId: group!.id,
          totalCents: 4200,
          currency: 'EUR',
          paymentReference: `PAY-${suffix}`,
        })
        .returning();
      const repo = createCheckoutRepository(db);
      const eventA = {
        id: `evt-${suffix}`,
        organizationId: organizationId(orgA!.id),
        invoiceId: invoice!.id,
        type: 'succeeded' as const,
        amountCents: 4200,
        currency: 'eur',
        paymentId: `pi-${suffix}`,
      };
      expect(
        await repo.applyProviderEvent({
          ...eventA,
          organizationId: organizationId(orgB!.id),
        }),
      ).toBe('not_found');
      expect(await repo.applyProviderEvent(eventA)).toBe('applied');
      expect(await repo.applyProviderEvent(eventA)).toBe('duplicate');
      const recorded = await db
        .select()
        .from(invoicePayments)
        .where(
          and(
            eq(invoicePayments.organizationId, orgA!.id),
            eq(invoicePayments.invoiceId, invoice!.id),
          ),
        );
      const audit = await db
        .select()
        .from(invoicePaymentAuditEvents)
        .where(eq(invoicePaymentAuditEvents.organizationId, orgA!.id));
      const [updatedInvoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoice!.id));
      expect(recorded).toHaveLength(1);
      expect(recorded[0]?.amountCents).toBe(4200);
      expect(recorded[0]?.providerPaymentId).toBe(`pi-${suffix}`);
      expect(audit).toHaveLength(1);
      expect(updatedInvoice?.status).toBe('paid');
    } finally {
      if (createdEventId)
        await db.delete(events).where(eq(events.id, createdEventId));
      if (createdOrganizations.length)
        await db
          .delete(organizations)
          .where(inArray(organizations.id, createdOrganizations));
      await pool.end();
    }
  });

  it('records partial and full provider refunds idempotently and keeps them organization-scoped', async () => {
    await migrate(url!);
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const createdOrganizations: string[] = [];
    let createdEventId: string | undefined;
    try {
      const [orgA, orgB] = await db
        .insert(organizations)
        .values([
          {
            slug: `refund-a-${suffix}`,
            name: 'Refund A',
            timezone: 'UTC',
            locale: 'en',
            currency: 'EUR',
          },
          {
            slug: `refund-b-${suffix}`,
            name: 'Refund B',
            timezone: 'UTC',
            locale: 'en',
            currency: 'EUR',
          },
        ])
        .returning();
      createdOrganizations.push(orgA!.id, orgB!.id);
      const [event] = await db
        .insert(events)
        .values({
          organizationId: orgA!.id,
          slug: `refund-${suffix}`,
          name: 'Refund race',
          startsOn: '2030-01-01',
          endsOn: '2030-01-02',
          status: 'open',
        })
        .returning();
      createdEventId = event!.id;
      const [person] = await db
        .insert(people)
        .values({
          organizationId: orgA!.id,
          firstName: 'Ada',
          lastName: 'Driver',
        })
        .returning();
      const [group] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgA!.id,
          eventId: event!.id,
          personId: person!.id,
        })
        .returning();
      const [invoice] = await db
        .insert(invoices)
        .values({
          organizationId: orgA!.id,
          eventId: event!.id,
          registrationGroupId: group!.id,
          totalCents: 4200,
          currency: 'EUR',
          paymentReference: `REF-${suffix}`,
        })
        .returning();
      const providerPaymentId = `pi-refund-${suffix}`;
      await db.insert(invoicePayments).values({
        organizationId: orgA!.id,
        invoiceId: invoice!.id,
        amountCents: 4200,
        providerPaymentId,
        actor: 'stripe',
        reason: 'Checkout',
      });
      const repo = createPaymentRefundRepository(db);
      const ctx = (id: string) =>
        createRequestContext({
          deploymentMode: 'community',
          organizationId: organizationId(id),
          permissions: new Set(['payment:write']),
          capabilities: new Set(),
          correlationId: suffix,
        });
      const refundable = await repo.getRefundable(
        ctx(orgA!.id),
        invoice!.id,
        providerPaymentId,
      );
      expect(refundable?.refundableCents).toBe(4200);
      expect(
        await repo.getRefundable(ctx(orgB!.id), invoice!.id, providerPaymentId),
      ).toBeNull();
      const base = {
        ...refundable!,
        amountCents: 1000,
        providerRefundId: `re-partial-${suffix}`,
        actor: 'admin',
        reason: 'Partial',
      };
      expect(await repo.recordRefund(ctx(orgA!.id), base)).toBe('recorded');
      expect(await repo.recordRefund(ctx(orgA!.id), base)).toBe('duplicate');
      expect(
        (
          await repo.getRefundable(
            ctx(orgA!.id),
            invoice!.id,
            providerPaymentId,
          )
        )?.refundableCents,
      ).toBe(3200);
      expect(
        await repo.recordRefund(ctx(orgA!.id), {
          ...base,
          amountCents: 3200,
          providerRefundId: `re-full-${suffix}`,
          reason: 'Remaining',
        }),
      ).toBe('recorded');
      const rows = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, invoice!.id));
      const audit = await db
        .select()
        .from(invoicePaymentAuditEvents)
        .where(eq(invoicePaymentAuditEvents.organizationId, orgA!.id));
      const [updatedInvoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoice!.id));
      expect(rows.map((row) => row.amountCents)).toEqual([4200, -1000, -3200]);
      expect(audit.filter((row) => row.action === 'refund')).toHaveLength(2);
      expect(updatedInvoice?.status).toBe('open');
    } finally {
      if (createdEventId)
        await db.delete(events).where(eq(events.id, createdEventId));
      if (createdOrganizations.length)
        await db
          .delete(organizations)
          .where(inArray(organizations.id, createdOrganizations));
      await pool.end();
    }
  });
});
