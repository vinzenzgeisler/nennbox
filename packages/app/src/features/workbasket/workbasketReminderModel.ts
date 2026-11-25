import type {
  MessageCampaignCreate,
  MessageRecipientFilter,
  MessageRecipientPreview,
  MessageRenderedPreview,
} from '@nennbox/contracts';
export const templates = {
  missingDocuments: {
    subject: 'Bitte fehlende Unterlagen ergänzen – {{eventName}}',
    text: 'Hallo {{fullName}},\n\nfür deine Nennung bei {{eventName}} fehlen noch erforderliche Unterlagen. Bitte prüfe deine Nennung und ergänze die fehlenden oder abgelehnten Dokumente.\n\nVielen Dank!',
  },
  paymentOpen: {
    subject: 'Erinnerung an die offene Zahlung – {{eventName}}',
    text: 'Hallo {{fullName}},\n\nfür deine Nennung bei {{eventName}} ist noch eine Zahlung offen. Bitte prüfe deine Rechnung und begleiche den offenen Betrag mit der dort angegebenen Zahlungsreferenz. Falls du inzwischen bezahlt hast, prüfe bitte den aktuellen Zahlungsstand.\n\nVielen Dank!',
  },
};
export type Rule = keyof typeof templates;
export type Preview = {
  filter: MessageRecipientFilter;
  recipients: MessageRecipientPreview;
  rendered: MessageRenderedPreview;
  skipped: string[];
};
export function fingerprint(value: MessageRecipientPreview) {
  return JSON.stringify([
    value.count,
    value.recipients.map((item) => [item.entryId, item.email]).sort(),
  ]);
}
export function makeFilter(ids: string[]): MessageRecipientFilter {
  if (!ids.length || ids.length > 500)
    throw new Error('Bitte 1 bis 500 Nennungen auswählen.');
  return {
    classIds: [],
    statuses: [],
    entryStatusIds: [],
    // Current workbasket eligibility includes unpaid entries without an open invoice.
    payment: 'any',
    entryIds: ids,
    additionalAddresses: [],
  };
}

/** Capture exactly the deduplicated addresses and representative entries shown for confirmation. */
export function makeWorkbasketConfirmation(
  ruleId: Rule,
  preview: MessageRecipientPreview,
): NonNullable<MessageCampaignCreate['workbasketConfirmation']> {
  return {
    ruleId,
    recipients: preview.recipients.map(({ entryId, email }) => ({
      entryId,
      email,
    })),
  };
}
