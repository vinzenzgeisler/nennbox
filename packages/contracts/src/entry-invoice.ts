import { z } from 'zod';

/** Invoice summary in the admin entry detail, including refundable payments and the automatic refund. */
export const AdminEntryInvoiceSchema = z
  .object({
    id: z.string().uuid(),
    paymentReference: z.string(),
    currency: z.string(),
    totalCents: z.number().int().nonnegative(),
    paidCents: z.number().int(),
    paidAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(['open', 'partially_paid', 'paid', 'cancelled']),
    providerPayments: z
      .array(
        z
          .object({
            providerPaymentId: z.string(),
            refundableCents: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .default([]),
    /** Outcome of the automatic refund after a cancellation, if one was triggered. */
    refundIntent: z
      .object({
        status: z.enum(['pending', 'processing', 'done', 'failed', 'skipped']),
        percent: z.number().int().min(0).max(100).nullable(),
        refundedCents: z.number().int().nonnegative(),
        failure: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
