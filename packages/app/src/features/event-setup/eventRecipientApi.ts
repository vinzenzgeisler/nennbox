import { z } from 'zod';
import { request, type SetupDraft } from './eventSetupApi.js';
const RecipientSchema = z.object({
  recipient: z
    .object({
      accountName: z.string(),
      address: z.string().nullable().optional(),
      iban: z.string(),
      bic: z.string().nullable(),
    })
    .nullable(),
});
export const loadRecipient = (signal?: AbortSignal) =>
  request(
    '/admin/organization/payment-recipient',
    RecipientSchema,
    signal ? { signal } : undefined,
  );
export const saveRecipient = (draft: SetupDraft) =>
  request('/admin/organization/payment-recipient', RecipientSchema, {
    method: 'PUT',
    body: JSON.stringify({
      accountName: draft.accountName.trim(),
      address: draft.recipientAddress.trim() || null,
      iban: draft.iban.trim(),
      bic: draft.bic.trim() || null,
    }),
  });
export const deleteRecipient = () =>
  request('/admin/organization/payment-recipient', RecipientSchema, {
    method: 'DELETE',
  });
