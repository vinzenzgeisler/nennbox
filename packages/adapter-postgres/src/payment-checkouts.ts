import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CheckoutInvoice, CheckoutRepository } from '@nennbox/core';
import type { Database } from './database.js';
import { invoices } from './schema/billing.js';
import { checkoutSessions } from './schema/provider-payments.js';
import { applyProviderEventInTransaction } from './payment-event-apply.js';
import { loadPaymentSettings } from './payment-settings.js';

export function createCheckoutRepository(db: Database): CheckoutRepository {
  return {
    get: async (ctx, invoiceId) => {
      const [invoice] = await db
        .select({
          id: invoices.id,
          organizationId: invoices.organizationId,
          eventId: invoices.eventId,
          eventSlug: sql<string>`(select e.slug from event e where e.organization_id = invoice.organization_id and e.id = invoice.event_id)`,
          totalCents: invoices.totalCents,
          currency: invoices.currency,
          status: invoices.status,
          paidCents: sql<number>`coalesce((select sum(p.amount_cents) from invoice_payment p where p.organization_id = invoice.organization_id and p.invoice_id = invoice.id), 0)::int`,
          sessionCount: sql<number>`(select count(*) from payment_checkout_session s where s.organization_id = invoice.organization_id and s.invoice_id = invoice.id)::int`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.id, invoiceId),
          ),
        );
      if (!invoice) return null;
      // Organization default and event override, the same merge the form uses.
      const settings = await loadPaymentSettings(
        db,
        ctx.organizationId,
        invoice.eventId,
      );
      const [pending] = await db
        .select({
          id: checkoutSessions.providerSessionId,
          url: checkoutSessions.url,
          amountCents: checkoutSessions.amountCents,
          expiresAt: checkoutSessions.expiresAt,
        })
        .from(checkoutSessions)
        .where(
          and(
            eq(checkoutSessions.organizationId, ctx.organizationId),
            eq(checkoutSessions.invoiceId, invoiceId),
            eq(checkoutSessions.status, 'checkout_pending'),
            sql`(${checkoutSessions.expiresAt} is null or ${checkoutSessions.expiresAt} > now())`,
          ),
        )
        .orderBy(desc(checkoutSessions.createdAt))
        .limit(1);
      return {
        ...invoice,
        organizationId: invoice.organizationId as typeof ctx.organizationId,
        paymentMethods: settings?.onlineMethods ?? [],
        paidCents: Number(invoice.paidCents),
        sessionCount: Number(invoice.sessionCount),
        status: invoice.status as CheckoutInvoice['status'],
        pendingSession: pending
          ? {
              ...pending,
              expiresAt: pending.expiresAt?.toISOString() ?? null,
            }
          : null,
      };
    },
    createSession: async (ctx, invoiceId, session) => {
      await db.insert(checkoutSessions).values({
        organizationId: ctx.organizationId,
        invoiceId,
        provider: 'stripe',
        providerSessionId: session.id,
        url: session.url,
        amountCents: session.amountCents,
        expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
      });
    },
    pendingSessions: async (ctx, invoiceId) =>
      db
        .select({ id: checkoutSessions.providerSessionId })
        .from(checkoutSessions)
        .where(
          and(
            eq(checkoutSessions.organizationId, ctx.organizationId),
            eq(checkoutSessions.invoiceId, invoiceId),
            eq(checkoutSessions.status, 'checkout_pending'),
          ),
        )
        .orderBy(desc(checkoutSessions.createdAt)),
    markSessionsExpired: async (ctx, invoiceId, sessionIds) => {
      if (!sessionIds.length) return;
      await db
        .update(checkoutSessions)
        .set({ status: 'expired' })
        .where(
          and(
            eq(checkoutSessions.organizationId, ctx.organizationId),
            eq(checkoutSessions.invoiceId, invoiceId),
            inArray(checkoutSessions.providerSessionId, [...sessionIds]),
          ),
        );
    },
    applyProviderEvent: async (event) =>
      db.transaction(async (tx) =>
        applyProviderEventInTransaction(db, tx, event),
      ),
  };
}
