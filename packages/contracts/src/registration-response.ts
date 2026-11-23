import { z } from 'zod';

/** Submission outcomes in request order; positions are scoped to each class. */
export const PublicRegistrationResponseSchema = z
  .object({
    accepted: z.literal(true),
    entryCount: z.number().int().positive(),
    entries: z.array(
      z.discriminatedUnion('status', [
        z
          .object({
            entryId: z.string().uuid(),
            status: z.literal('pending'),
            waitlistPosition: z.null(),
          })
          .strict(),
        z
          .object({
            entryId: z.string().uuid(),
            status: z.literal('waitlisted'),
            waitlistPosition: z.number().int().positive(),
          })
          .strict(),
      ]),
    ),
    invoiceId: z.string().uuid().optional(),
    paymentInstructions: z
      .object({
        accountName: z.string(),
        iban: z.string(),
        bic: z.string().nullable(),
        paymentReference: z.string(),
        amountCents: z.number().int(),
        currency: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PublicRegistrationResponse = z.infer<
  typeof PublicRegistrationResponseSchema
>;
