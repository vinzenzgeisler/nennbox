import { AppSelectionList } from '@nennbox/ui';
import type { MessageCampaignRecord } from '@nennbox/contracts';
export function WorkbasketCampaignResult({
  campaign,
}: {
  campaign: MessageCampaignRecord;
}) {
  return (
    <>
      <p role="status">
        {campaign.sent} gesendet · {campaign.failed} fehlgeschlagen ·{' '}
        {
          campaign.recipients.filter(
            (item) => item.status === 'planned' || item.status === 'sending',
          ).length
        }{' '}
        eingereiht / in Bearbeitung
      </p>
      <p>
        {campaign.status === 'sent'
          ? 'Versand abgeschlossen.'
          : campaign.status === 'failed'
            ? 'Versand ganz oder teilweise fehlgeschlagen. Details unten prüfen.'
            : 'Versandauftrag angenommen. Eingereiht bedeutet noch nicht gesendet.'}
      </p>
      <AppSelectionList label="Versand je Empfänger">
        {campaign.recipients.map((recipient) => (
          <span key={recipient.id}>
            {recipient.email}
            {recipient.entryId ? ` (Nennung ${recipient.entryId})` : ''}:{' '}
            {recipient.status === 'sent'
              ? 'gesendet'
              : recipient.status === 'failed'
                ? 'fehlgeschlagen'
                : 'eingereiht / in Bearbeitung'}
          </span>
        ))}
      </AppSelectionList>
    </>
  );
}
