import type { TransactionDatabase } from './database.js';
import { organizationPaymentRecipients } from './schema/billing.js';
import { and, eq, inArray } from 'drizzle-orm';
import { entries } from './schema/entries.js';

export interface RegistrationSubmissionResponse {
  accepted: true;
  entryCount: number;
  entries: Array<{
    entryId: string;
    status: 'pending' | 'waitlisted';
    waitlistPosition: number | null;
  }>;
  invoiceId?: string;
  paymentInstructions?: {
    accountName: string;
    iban: string;
    bic: string | null;
    paymentReference: string;
    amountCents: number;
    currency: string;
  };
}

type Invoice = {
  id: string;
  paymentReference: string;
  totalCents: number;
  currency: string;
};

export async function createRegistrationSubmissionResponse({
  tx,
  organizationId,
  invoice,
  entryIds,
}: {
  tx: TransactionDatabase;
  organizationId: string;
  invoice: Invoice | null;
  entryIds: string[];
}): Promise<RegistrationSubmissionResponse> {
  const [recipient] = invoice
    ? await tx
        .select({
          accountName: organizationPaymentRecipients.accountName,
          iban: organizationPaymentRecipients.iban,
          bic: organizationPaymentRecipients.bic,
        })
        .from(organizationPaymentRecipients)
        .where(eq(organizationPaymentRecipients.organizationId, organizationId))
    : [];
  const rows = await tx
    .select({
      entryId: entries.id,
      status: entries.acceptanceStatus,
      waitlistPosition: entries.waitlistPosition,
    })
    .from(entries)
    .where(
      and(
        eq(entries.organizationId, organizationId),
        inArray(entries.id, entryIds),
      ),
    );
  const byId = new Map(rows.map((row) => [row.entryId, row]));
  const submittedEntries = entryIds.map(
    (id): RegistrationSubmissionResponse['entries'][number] => {
      const row = byId.get(id);
      if (!row || (row.status !== 'pending' && row.status !== 'waitlisted'))
        throw new Error('Unexpected newly submitted entry status');
      return {
        entryId: row.entryId,
        status: row.status,
        waitlistPosition: row.waitlistPosition,
      };
    },
  );
  return {
    accepted: true as const,
    entryCount: entryIds.length,
    entries: submittedEntries,
    ...(invoice
      ? {
          invoiceId: invoice.id,
          ...(recipient
            ? {
                paymentInstructions: {
                  accountName: recipient.accountName,
                  iban: recipient.iban,
                  bic: recipient.bic,
                  paymentReference: invoice.paymentReference,
                  amountCents: invoice.totalCents,
                  currency: invoice.currency,
                },
              }
            : {}),
        }
      : {}),
  };
}
