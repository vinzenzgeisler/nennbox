import { relativeEntryTime } from './relativeEntryTime.js';
import {
  AppButton,
  DetailSection,
  EntryMessageList,
  StatusLabel,
} from '@nennbox/ui';

import type { EntryMessage } from './useEntryDetailReads.js';

const STATUS = {
  sent: ['done', 'Gesendet'],
  pending: ['in_progress', 'Wartet'],
  sending: ['in_progress', 'Wird gesendet'],
  failed: ['missing', 'Fehlgeschlagen'],
} as const;

export function EntryMessagesSection({
  messages,
  failed,
  onWrite,
}: {
  messages: EntryMessage[] | null;
  failed: boolean;
  onWrite?: (() => void) | undefined;
}) {
  return (
    <DetailSection
      title="Nachrichten"
      action={
        onWrite && (
          <AppButton tone="secondary" onClick={onWrite}>
            Nachricht schreiben
          </AppButton>
        )
      }
    >
      {failed ? (
        <p role="alert">
          Die Nachrichten konnten nicht geladen werden. Öffne die Nennung
          erneut.
        </p>
      ) : messages === null ? (
        <p role="status">Nachrichten werden geladen …</p>
      ) : (
        <EntryMessageList
          empty={<p>Zu dieser Nennung wurden noch keine E-Mails erzeugt.</p>}
          items={messages.map((message) => ({
            id: message.id,
            status: (
              <StatusLabel
                status={STATUS[message.status][0]}
                label={STATUS[message.status][1]}
              />
            ),
            subject: message.subject,
            template: message.templateKey,
            recipient: message.recipient,
            dateTime: message.sentAt ?? message.createdAt,
            time: relativeEntryTime(message.sentAt ?? message.createdAt),
          }))}
        />
      )}
    </DetailSection>
  );
}
