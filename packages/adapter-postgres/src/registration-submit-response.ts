import type { TransactionDatabase } from './database.js';
import { organizationPaymentRecipients } from './schema/billing.js';
import { eq } from 'drizzle-orm';

export interface RegistrationSubmissionResponse {
  accepted: true;
  entryCount: number;
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
  entryCount,
}: {
  tx: TransactionDatabase;
  organizationId: string;
  invoice: Invoice | null;
  entryCount: number;
}) {
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
  return {
    accepted: true as const,
    entryCount,
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
