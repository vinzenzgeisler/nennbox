import { and, eq, sql } from 'drizzle-orm';
import type { PaymentProviderEvent, ProviderEventResult } from '@nennbox/core';
import { deriveInvoiceStatus } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import {
  invoices,
  invoicePayments,
  invoicePaymentAuditEvents,
} from './schema/billing.js';
import {
  checkoutSessions,
  paymentProviderEvents,
} from './schema/provider-payments.js';
import { queuePaymentReceivedMail } from './payment-mail.js';

const sumLedger = (
  tx: TransactionDatabase,
  organizationId: string,
  invoiceId: string,
) =>
  tx
    .select({
      amount: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)::int`,
    })
    .from(invoicePayments)
    .where(
      and(
        eq(invoicePayments.organizationId, organizationId),
        eq(invoicePayments.invoiceId, invoiceId),
      ),
    )
    .then(([row]) => Number(row?.amount ?? 0));

/**
 * Applies one signed provider event inside the caller's transaction. The event
 * id is stored first, so a replay stops at the unique key before touching the
 * ledger. Money that was really received is always booked; a differing amount
 * is reported through the result instead of being dropped.
 */
export async function applyProviderEventInTransaction(
  db: Database,
  tx: TransactionDatabase,
  event: PaymentProviderEvent,
): Promise<ProviderEventResult> {
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
  let mismatch = false;
  if (event.type === 'succeeded') {
    if (event.amountCents <= 0)
      throw new Error('Stripe amount is not positive');
    const outstanding =
      invoice.totalCents -
      (await sumLedger(tx, event.organizationId, event.invoiceId));
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
    mismatch = event.amountCents !== outstanding;
    const reason = mismatch
      ? `Stripe payment ${event.paymentId} (Betrag weicht vom offenen Betrag ab: erwartet ${outstanding}, erhalten ${event.amountCents} ${event.currency.toUpperCase()})`
      : `Stripe payment ${event.paymentId}`;
    const [payment] = await tx
      .insert(invoicePayments)
      .values({
        organizationId: event.organizationId,
        invoiceId: event.invoiceId,
        amountCents: event.amountCents,
        method: 'online',
        actor: 'stripe:webhook',
        reason,
        providerPaymentId: event.paymentId,
      })
      .returning({ id: invoicePayments.id });
    await tx.insert(invoicePaymentAuditEvents).values({
      organizationId: event.organizationId,
      paymentId: payment!.id,
      action: 'recorded',
      actor: 'stripe:webhook',
      reason,
    });
    await tx
      .update(invoices)
      .set({
        status: deriveInvoiceStatus(
          invoice.totalCents,
          await sumLedger(tx, event.organizationId, event.invoiceId),
        ),
      })
      .where(
        and(
          eq(invoices.organizationId, event.organizationId),
          eq(invoices.id, event.invoiceId),
        ),
      );
    await queuePaymentReceivedMail(db, tx, event);
  }
  // A terminal session state is never left again (database trigger), so a late
  // "expired" after "paid" cannot undo it. Without a session id (account-aware
  // providers may omit it) every open session of the invoice takes the state.
  await tx
    .update(checkoutSessions)
    .set({ status: event.type === 'succeeded' ? 'paid' : event.type })
    .where(
      and(
        eq(checkoutSessions.organizationId, event.organizationId),
        eq(checkoutSessions.invoiceId, event.invoiceId),
        event.sessionId
          ? eq(checkoutSessions.providerSessionId, event.sessionId)
          : eq(checkoutSessions.status, 'checkout_pending'),
      ),
    );
  return mismatch ? 'applied_with_mismatch' : 'applied';
}
