import { relativeEntryTime } from '../entries/detail/relativeEntryTime.js';
import {
  AppButton,
  AppTable,
  AppStatusPill,
  AppSection,
  AppActions,
  AppNotice,
} from '@nennbox/ui';
import type { MessageCampaignRecord } from '@nennbox/contracts';
import { messagesApi } from './messagesApi.js';
import { useState } from 'react';

const statusLabels = {
  planned: 'Geplant',
  sending: 'Wird gesendet',
  sent: 'Gesendet',
  failed: 'Fehlgeschlagen',
};
export function MessageOutbox({
  campaigns,
  onChanged,
}: {
  campaigns: MessageCampaignRecord[];
  onChanged: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  return (
    <AppSection title="Postausgang">
      <AppActions>
        <AppButton tone="secondary" onClick={onChanged}>
          Postausgang aktualisieren
        </AppButton>
      </AppActions>
      {error && <AppNotice tone="error">{error}</AppNotice>}
      <AppTable
        headers={['Betreff', 'Status', 'Empfänger', 'Erstellt', 'Aktion']}
      >
        {campaigns.map((campaign) => (
          <tr key={campaign.id}>
            <td>{campaign.subject}</td>
            <td>
              <AppStatusPill
                status={
                  campaign.status === 'sent'
                    ? 'zu'
                    : campaign.status === 'failed'
                      ? 'neg'
                      : 'vor'
                }
              >
                {statusLabels[campaign.status]}
              </AppStatusPill>
            </td>
            <td>
              {campaign.sent}/{campaign.total}
              {campaign.failed ? ` · ${campaign.failed} fehlgeschlagen` : ''}
            </td>
            <td>
              <time dateTime={campaign.createdAt}>
                {relativeEntryTime(campaign.createdAt)}
              </time>
            </td>
            <td>
              {campaign.status === 'failed' && (
                <AppButton
                  tone="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setBusy(campaign.id);
                    setError('');
                    void messagesApi
                      .retry(campaign.id)
                      .then(onChanged)
                      .catch(() =>
                        setError(
                          'Erneutes Senden fehlgeschlagen. Prüfe deine Verbindung und versuche es erneut.',
                        ),
                      )
                      .finally(() => setBusy(''));
                  }}
                >
                  Fehlgeschlagene erneut senden
                </AppButton>
              )}
            </td>
          </tr>
        ))}
      </AppTable>
      {!campaigns.length && <p>Noch keine Nachrichten versendet.</p>}
    </AppSection>
  );
}
