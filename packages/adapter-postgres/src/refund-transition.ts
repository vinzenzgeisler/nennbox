import { entryStatusCategory } from './entry-status-category.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionDatabase } from './database.js';
import { entries } from './schema/entries.js';
import { invoices } from './schema/billing.js';
import {
  paymentRefundIntents,
  paymentRefundReservations,
} from './schema/provider-payments.js';
import { countActiveEntries } from './entry-group-activity.js';

/**
 * Lock order for everything that touches money and participation, in every
 * code path: **invoice row first, then the entry rows of the group (ordered by
 * id), then anything else**. Refund reservation, recording, settlement,
 * acceptance transitions, driver cancellation and the admin actions that change
 * amount or class all follow it, so two of them can wait for each other but
 * never deadlock. A new path that locks entry rows before the invoice would
 * reintroduce the inversion (PostgreSQL then aborts one side with 40P01).
 */
export async function lockInvoiceOfGroup(
  tx: TransactionDatabase,
  organizationId: string,
  groupId: string,
) {
  const [invoice] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.registrationGroupId, groupId),
      ),
    )
    .for('update');
  return invoice ?? null;
}

async function lockInvoice(
  tx: TransactionDatabase,
  organizationId: string,
  entryId: string,
) {
  const [entry] = await tx
    .select({ groupId: entries.registrationGroupId })
    .from(entries)
    .where(
      and(eq(entries.organizationId, organizationId), eq(entries.id, entryId)),
    );
  if (!entry) return null;
  const invoice = await lockInvoiceOfGroup(tx, organizationId, entry.groupId);
  return invoice ? { ...invoice, groupId: entry.groupId } : null;
}

/** Lock before changing entry rows, in the same order as refund reservation. */
export async function guardRefundTransition(
  tx: TransactionDatabase,
  organizationId: string,
  entryId: string,
  target: string,
) {
  const invoice = await lockInvoice(tx, organizationId, entryId);
  if (!invoice) return;
  const [entry] = await tx
    .select({
      category: entryStatusCategory(
        entries.organizationId,
        entries.workflowRevisionId,
        sql`${target}`,
      ),
    })
    .from(entries)
    .where(
      and(eq(entries.organizationId, organizationId), eq(entries.id, entryId)),
    );
  if (entry && ['withdrawn', 'rejected'].includes(entry.category)) return;
  const [running] = await tx
    .select({
      id: paymentRefundReservations.id,
      needsReviewAt: paymentRefundReservations.needsReviewAt,
    })
    .from(paymentRefundReservations)
    .where(
      and(
        eq(paymentRefundReservations.organizationId, organizationId),
        eq(paymentRefundReservations.invoiceId, invoice.id),
        eq(paymentRefundReservations.status, 'reserved'),
      ),
    )
    .limit(1);
  // An unresolved provider operation must be reconciled before reactivation.
  if (running)
    throw new Error(
      running.needsReviewAt ? 'refund_needs_review' : 'refund_in_progress',
    );
}

export async function invalidateReactivatedRefunds(
  tx: TransactionDatabase,
  organizationId: string,
  entryId: string,
) {
  const invoice = await lockInvoice(tx, organizationId, entryId);
  if (
    !invoice ||
    (await countActiveEntries(tx, organizationId, invoice.groupId)) === 0
  )
    return;
  // Waiting intents are void. A finished one is history: the money went back,
  // so it is marked superseded (a later cancellation may open a new intent),
  // never rewritten to "skipped". Failed and skipped intents stay as they are.
  await tx
    .update(paymentRefundIntents)
    .set({
      status: 'skipped',
      failure: 'registration_reactivated',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentRefundIntents.organizationId, organizationId),
        eq(paymentRefundIntents.invoiceId, invoice.id),
        inArray(paymentRefundIntents.status, ['pending', 'processing']),
      ),
    );
  await tx
    .update(paymentRefundIntents)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(paymentRefundIntents.organizationId, organizationId),
        eq(paymentRefundIntents.invoiceId, invoice.id),
        eq(paymentRefundIntents.status, 'done'),
      ),
    );
}
