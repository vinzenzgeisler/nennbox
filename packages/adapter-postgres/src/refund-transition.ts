import { and, eq } from 'drizzle-orm';
import type { TransactionDatabase } from './database.js';
import { entries } from './schema/entries.js';
import { invoices } from './schema/billing.js';
import {
  paymentRefundIntents,
  paymentRefundReservations,
} from './schema/provider-payments.js';
import { countActiveEntries } from './entry-group-activity.js';

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
  const [invoice] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.registrationGroupId, entry.groupId),
      ),
    )
    .for('update');
  return invoice ? { ...invoice, groupId: entry.groupId } : null;
}

/** Lock before changing entry rows, in the same order as refund reservation. */
export async function guardRefundTransition(
  tx: TransactionDatabase,
  organizationId: string,
  entryId: string,
  target: string,
  category?: string,
) {
  const invoice = await lockInvoice(tx, organizationId, entryId);
  if (!invoice || ['withdrawn', 'rejected'].includes(category ?? target))
    return;
  const [running] = await tx
    .select({ id: paymentRefundReservations.id })
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
  if (running) throw new Error('refund_in_progress');
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
      ),
    );
}
