import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createRequestContext, organizationId } from '@nennbox/core';
import { createDatabase, migrate } from './database-service.js';
import { createInvoicePaymentRepository } from './billing-payments.js';
import { createCheckoutRepository } from './payment-checkouts.js';
import { createPaymentRefundRepository } from './payment-refunds.js';
import { loadInvoiceSummaries } from './entry-admin-invoice.js';
import { organizations, events } from './schema/organization.js';
import { people, registrationGroups } from './schema/entries.js';
import { invoices, invoicePayments } from './schema/billing.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('invoice paid timestamps', () => {
  it('tracks manual/bank/office and provider payments, corrections, refunds and repayment', async () => {
    await migrate(url!);
    const { db, pool } = await createDatabase(url!);
    let orgId: string | undefined;
    try {
      const suffix = crypto.randomUUID();
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `paid-at-${suffix}`,
          name: 'Paid at',
          timezone: 'UTC',
          locale: 'de',
        })
        .returning();
      orgId = org!.id;
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(orgId),
        permissions: new Set(),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const [event] = await db
        .insert(events)
        .values({
          organizationId: orgId,
          slug: 'event',
          name: 'Race',
          startsOn: '2030-01-01',
          endsOn: '2030-01-01',
        })
        .returning();
      const [person] = await db
        .insert(people)
        .values({
          organizationId: orgId,
          firstName: 'Ada',
          lastName: 'Driver',
        })
        .returning();
      const [group] = await db
        .insert(registrationGroups)
        .values({
          organizationId: orgId,
          eventId: event!.id,
          personId: person!.id,
        })
        .returning();
      const [invoice] = await db
        .insert(invoices)
        .values({
          organizationId: orgId,
          eventId: event!.id,
          registrationGroupId: group!.id,
          totalCents: 1000,
          currency: 'EUR',
          paymentReference: `PAID-${suffix}`,
        })
        .returning();
      const invoiceId = invoice!.id;
      const read = async () => {
        const [row] = await db
          .select()
          .from(invoices)
          .where(eq(invoices.id, invoiceId));
        return row!;
      };
      const latestPayment = async () => {
        const rows = await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, invoiceId));
        return rows.find(
          (row) =>
            row.providerPaymentId === `pi-${suffix}` && !row.providerRefundId,
        )!;
      };
      const manual = createInvoicePaymentRepository(db);
      const record = async (amount: number, actor: string, reason: string) => {
        await manual.record(ctx, invoiceId, amount, actor, reason);
        const rows = await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, invoiceId));
        return rows.find((row) => row.reason === reason)!;
      };
      expect((await read()).paidAt).toBeNull();
      await record(400, 'bank:import', 'Bank transfer');
      expect((await read()).paidAt).toBeNull();
      const office = await record(600, 'office:cash', 'Cash receipt');
      expect((await read()).paidAt).toEqual(office!.occurredAt);
      const extra = await record(100, 'office:cash', 'Overpayment');
      expect((await read()).paidAt).toEqual(office!.occurredAt);
      await manual.correct(
        ctx,
        extra!.id,
        'office:cash',
        'Correct overpayment',
      );
      expect((await read()).paidAt).toEqual(office!.occurredAt);
      await manual.correct(ctx, office!.id, 'office:cash', 'Reverse receipt');
      expect((await read()).status).toBe('partially_paid');
      expect((await read()).paidAt).toBeNull();

      const checkout = createCheckoutRepository(db);
      const providerEvent = {
        id: `evt-${suffix}`,
        organizationId: ctx.organizationId,
        invoiceId,
        type: 'succeeded' as const,
        amountCents: 600,
        currency: 'EUR',
        paymentId: `pi-${suffix}`,
      };
      expect(await checkout.applyProviderEvent(providerEvent)).toBe('applied');
      const provider = await latestPayment();
      expect((await read()).paidAt).toEqual(provider.occurredAt);
      expect(await checkout.applyProviderEvent(providerEvent)).toBe(
        'duplicate',
      );
      expect((await read()).paidAt).toEqual(provider.occurredAt);
      expect(
        (await loadInvoiceSummaries(db, ctx, [group!.id])).get(group!.id)
          ?.paidAt,
      ).toBe(provider.occurredAt.toISOString());

      const refunds = createPaymentRefundRepository(db);
      expect(
        await refunds.recordRefund(ctx, {
          invoiceId,
          providerPaymentId: providerEvent.paymentId,
          providerRefundId: `re-${suffix}`,
          refundableCents: 600,
          currency: 'EUR',
          amountCents: 100,
          actor: 'stripe:refund',
          reason: 'Partial refund',
        }),
      ).toBe('recorded');
      expect((await read()).paidAt).toBeNull();
      const repayment = await record(100, 'bank:import', 'Repayment');
      expect((await read()).paidAt).toEqual(repayment!.occurredAt);
      await db
        .update(invoices)
        .set({ status: 'cancelled' })
        .where(eq(invoices.id, invoiceId));
      expect((await read()).paidAt).toBeNull();
    } finally {
      if (orgId) {
        await db.delete(events).where(eq(events.organizationId, orgId));
        await db.delete(organizations).where(eq(organizations.id, orgId));
      }
      await pool.end();
    }
  });

  it('backfills the latest paid period from historical ledger dates, not later overpayments or checkout dates', async () => {
    const { pool } = await createDatabase(url!);
    const client = await pool.connect();
    const schema = `paid_at_${crypto.randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`create schema ${schema}`);
      await client.query(`set search_path to ${schema}, public`);
      // Minimal pre-migration tables isolate this migration from the shared DB.
      await client.query(`
        create table invoice (
          id uuid primary key, organization_id uuid not null,
          total_cents integer not null, status text not null
        );
        create table invoice_payment (
          id uuid primary key, organization_id uuid not null,
          invoice_id uuid not null, amount_cents integer not null,
          occurred_at timestamptz not null
        );
      `);
      const tenant = crypto.randomUUID();
      const paid = crypto.randomUUID();
      const open = crypto.randomUUID();
      const noHistory = crypto.randomUUID();
      await client.query(
        "insert into invoice values ($1, $4, 1000, 'paid'), ($2, $4, 1000, 'partially_paid'), ($3, $4, 1000, 'paid')",
        [paid, open, noHistory, tenant],
      );
      for (const [amount, date] of [
        [400, '2020-01-01'],
        [600, '2020-01-02'],
        [-200, '2020-01-03'],
        [200, '2020-01-04'],
        [100, '2020-01-05'],
      ] as const) {
        await client.query(
          'insert into invoice_payment values ($1, $2, $3, $4, $5)',
          [crypto.randomUUID(), tenant, paid, amount, date],
        );
      }
      await client.query(
        'insert into invoice_payment values ($1, $2, $3, 100, $4)',
        [crypto.randomUUID(), tenant, open, '2020-01-01'],
      );
      // Another tenant must not contribute even with the same invoice id.
      await client.query(
        'insert into invoice_payment values ($1, $2, $3, 5000, $4)',
        [crypto.randomUUID(), crypto.randomUUID(), paid, '2020-01-06'],
      );
      await client.query(
        readFileSync(
          new URL('../migrations/0041_invoice_paid_at.sql', import.meta.url),
          'utf8',
        ),
      );
      const result = await client.query<{ id: string; paid_at: Date | null }>(
        'select id, paid_at from invoice',
      );
      const dates = new Map(
        result.rows.map((row) => [row.id, row.paid_at?.toISOString() ?? null]),
      );
      expect(dates.get(paid)).toBe('2020-01-04T00:00:00.000Z');
      expect(dates.get(open)).toBeNull();
      expect(dates.get(noHistory)).toBeNull();
      await client.query("update invoice set status = 'paid' where id = $1", [
        paid,
      ]);
      expect(
        (
          await client.query('select paid_at from invoice where id = $1', [
            paid,
          ])
        ).rows[0].paid_at.toISOString(),
      ).toBe('2020-01-04T00:00:00.000Z');
    } finally {
      await client.query('set search_path to public');
      await client.query(`drop schema if exists ${schema} cascade`);
      client.release();
      await pool.end();
    }
  });
});
