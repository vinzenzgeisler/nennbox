import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CheckoutInvoice, CheckoutRepository } from '@nennbox/core';
import type { Database } from './database.js';
import { invoices } from './schema/billing.js';
import { checkoutSessions } from './schema/provider-payments.js';
import { countActiveEntries } from './entry-group-activity.js';
import { applyProviderEventInTransaction } from './payment-event-apply.js';
import { loadPaymentSettings } from './payment-settings.js';

export function createCheckoutRepository(db: Database): CheckoutRepository {
  return {
    withInvoiceLock: (ctx, invoiceId, run) =>
      db.transaction(async (tx) => {
        await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, ctx.organizationId),
              eq(invoices.id, invoiceId),
            ),
          )
          .for('update');
        const repository = createCheckoutRepository(tx as unknown as Database);
        delete repository.withInvoiceLock;
        return run(repository);
      }),
    get: async (ctx, invoiceId) => {
      const [invoice] = await db
        .select({
          id: invoices.id,
          registrationGroupId: invoices.registrationGroupId,
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
      const open = await db
        .select({
          id: checkoutSessions.providerSessionId,
          url: checkoutSessions.url,
          amountCents: checkoutSessions.amountCents,
          paymentMethods: checkoutSessions.paymentMethods,
          expiresAt: checkoutSessions.expiresAt,
        })
        .from(checkoutSessions)
        .where(
          and(
            eq(checkoutSessions.organizationId, ctx.organizationId),
            eq(checkoutSessions.invoiceId, invoiceId),
            eq(checkoutSessions.status, 'checkout_pending'),
          ),
        )
        .orderBy(desc(checkoutSessions.createdAt));
      const openSessions = open.map((session) => ({
        ...session,
        paymentMethods: session.paymentMethods as
          CheckoutInvoice['paymentMethods'] | null,
        expiresAt: session.expiresAt?.toISOString() ?? null,
      }));
      const now = Date.now();
      const pending =
        openSessions.find(
          (session) =>
            !session.expiresAt || Date.parse(session.expiresAt) > now,
        ) ?? null;
      const { registrationGroupId, ...rest } = invoice;
      const allEntriesCancelled =
        (await countActiveEntries(
          db,
          ctx.organizationId,
          registrationGroupId,
        )) === 0;
      return {
        ...rest,
        organizationId: invoice.organizationId as typeof ctx.organizationId,
        paymentMethods: settings?.onlineMethods ?? [],
        checkoutLifetimeMinutes: settings?.checkoutLifetimeMinutes ?? 60,
        paidCents: Number(invoice.paidCents),
        sessionCount: Number(invoice.sessionCount),
        status: invoice.status as CheckoutInvoice['status'],
        pendingSession: pending,
        openSessions,
        allEntriesCancelled,
      };
    },
    createSession: async (ctx, invoiceId, session) => {
      await db
        .insert(checkoutSessions)
        .values({
          organizationId: ctx.organizationId,
          invoiceId,
          provider: 'stripe',
          providerSessionId: session.id,
          url: session.url,
          amountCents: session.amountCents,
          paymentMethods: [...session.paymentMethods],
          expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
        })
        // Two requests (double click) get the same provider session through the
        // idempotency key; the second one must not fail on the unique session id.
        .onConflictDoNothing();
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
