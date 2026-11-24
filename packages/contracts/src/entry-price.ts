import { z } from 'zod';

export const PriceSnapshotSchema = z
  .object({
    version: z.literal('1'),
    currency: z.string().regex(/^[A-Z]{3}$/),
    calculatedAt: z.string().datetime({ offset: true }),
    totalCents: z.number().int().nonnegative(),
    lines: z.array(
      z
        .object({
          classId: z.string().uuid(),
          quantity: z.number().int().positive(),
          baseCents: z.number().int().nonnegative(),
          additionalEntryAdjustmentCents: z.number().int(),
          earlyBirdDiscountCents: z.number().int().nonnegative(),
          totalCents: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
