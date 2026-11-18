import { and, eq, sql } from 'drizzle-orm';
import type { CheckoutRepository } from '@racepilot/core';
import { deriveInvoiceStatus } from '@racepilot/core';
import type { Database } from './database.js';
import {
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';
import {
  checkoutSessions,
  paymentProviderEvents,
} from './schema/provider-payments.js';

export function createCheckoutRepository(db: Database): CheckoutRepository {
  return {
    get: async (ctx, invoiceId) => {
      const [invoice] = await db
        .select({
          id: invoices.id,
          organizationId: invoices.organizationId,
          eventId: invoices.eventId,
          eventSlug: sql<string>`(select e.slug from event e where e.organization_id = ${invoices.organizationId} and e.id = ${invoices.eventId})`,
          totalCents: invoices.totalCents,
          currency: invoices.currency,
          status: invoices.status,
          paidCents: sql<number>`coalesce((select sum(p.amount_cents) from invoice_payment p where p.organization_id = ${invoices.organizationId} and p.invoice_id = ${invoices.id}), 0)::int`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.id, invoiceId),
          ),
        );
      if (!invoice) return null;
      return {
        ...invoice,
        organizationId: invoice.organizationId as typeof ctx.organizationId,
        paidCents: Number(invoice.paidCents),
        status: invoice.status as
          'open' | 'partially_paid' | 'paid' | 'cancelled',
      };
    },
    createSession: async (ctx, invoiceId, providerSessionId, url) => {
      await db.insert(checkoutSessions).values({
        organizationId: ctx.organizationId,
        invoiceId,
        provider: 'stripe',
        providerSessionId,
        url,
      });
    },
    applyProviderEvent: async (event) =>
      db.transaction(async (tx) => {
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, event.organizationId),
              eq(invoices.id, event.invoiceId),
            ),
          )
          .for('update');
        if (
          !invoice ||
          invoice.status === 'cancelled' ||
          invoice.currency.toLowerCase() !== event.currency.toLowerCase()
        )
          return 'not_found';
        const [inserted] = await tx
          .insert(paymentProviderEvents)
          .values({
            organizationId: event.organizationId,
            provider: 'stripe',
            providerEventId: event.id,
            invoiceId: event.invoiceId,
            outcome: event.type,
            amountCents: event.amountCents,
            currency: event.currency.toLowerCase(),
            providerPaymentId: event.paymentId,
          })
          .onConflictDoNothing()
          .returning({ id: paymentProviderEvents.id });
        if (!inserted) return 'duplicate';
        if (event.type === 'succeeded') {
          const [paid] = await tx
            .select({
              amount: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)::int`,
            })
            .from(invoicePayments)
            .where(
              and(
                eq(invoicePayments.organizationId, event.organizationId),
                eq(invoicePayments.invoiceId, event.invoiceId),
              ),
            );
          const outstanding = invoice.totalCents - Number(paid?.amount ?? 0);
          if (event.amountCents <= 0 || event.amountCents !== outstanding)
            throw new Error(
              'Stripe amount does not match outstanding invoice amount',
            );
          const existing = await tx
            .select({ id: invoicePayments.id })
            .from(invoicePayments)
            .where(
              and(
                eq(invoicePayments.organizationId, event.organizationId),
                eq(invoicePayments.invoiceId, event.invoiceId),
                eq(invoicePayments.providerPaymentId, event.paymentId),
              ),
            )
            .limit(1);
          if (existing.length) return 'duplicate';
          const [payment] = await tx
            .insert(invoicePayments)
            .values({
              organizationId: event.organizationId,
              invoiceId: event.invoiceId,
              amountCents: event.amountCents,
              actor: 'stripe:webhook',
              reason: `Stripe payment ${event.paymentId}`,
              providerPaymentId: event.paymentId,
            })
            .returning({ id: invoicePayments.id });
          await tx.insert(invoicePaymentAuditEvents).values({
            organizationId: event.organizationId,
            paymentId: payment!.id,
            action: 'recorded',
            actor: 'stripe:webhook',
            reason: `Stripe payment ${event.paymentId}`,
          });
          const [sum] = await tx
            .select({
              amount: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)::int`,
            })
            .from(invoicePayments)
            .where(
              and(
                eq(invoicePayments.organizationId, event.organizationId),
                eq(invoicePayments.invoiceId, event.invoiceId),
              ),
            );
          await tx
            .update(invoices)
            .set({
              status: deriveInvoiceStatus(
                invoice.totalCents,
                Number(sum?.amount ?? 0),
              ),
            })
            .where(
              and(
                eq(invoices.organizationId, event.organizationId),
                eq(invoices.id, event.invoiceId),
              ),
            );
        }
        await tx
          .update(checkoutSessions)
          .set({ status: event.type === 'succeeded' ? 'paid' : event.type })
          .where(
            and(
              eq(checkoutSessions.organizationId, event.organizationId),
              eq(checkoutSessions.invoiceId, event.invoiceId),
              eq(checkoutSessions.status, 'checkout_pending'),
            ),
          );
        return 'applied';
      }),
  };
}
