import type { MessageCampaignCreate } from './messages.js';
import type {
  MessageCampaignRecipient,
  MessageCampaignTransaction,
  MessageCampaignSendResult,
} from './message-campaign-send.js';

export async function validateCampaignConfirmation<C, R>(
  tx: MessageCampaignTransaction<C, R>,
  eventId: string,
  input: MessageCampaignCreate,
  resolved: readonly MessageCampaignRecipient[],
): Promise<MessageCampaignSendResult<never> | { ok: true }> {
  const confirmation = input.workbasketConfirmation;
  if (!confirmation) return { ok: true };
  const changed = {
    ok: false as const,
    error: {
      code: 'confirmation-changed' as const,
      message:
        'Die Auswahl oder Empfänger haben sich geändert. Bitte Vorschau neu erstellen.',
    },
  };
  const filter = input.recipients;
  // Never allow a workbasket confirmation to select dynamic/all-entry or extra recipients.
  if (
    eventId !== input.eventId ||
    !filter.entryIds.length ||
    filter.additionalAddresses.length ||
    !confirmation.recipients.length
  )
    return changed;
  const eligible = new Set(
    await tx.eligibleWorkbasketEntries(eventId, confirmation.ruleId),
  );
  if (filter.entryIds.some((id) => !eligible.has(id))) return changed;
  const fingerprint = (
    items: readonly { entryId: string | null; email: string }[],
  ) =>
    JSON.stringify(items.map(({ entryId, email }) => [entryId, email]).sort());
  if (fingerprint(resolved) !== fingerprint(confirmation.recipients))
    return changed;
  return { ok: true };
}
