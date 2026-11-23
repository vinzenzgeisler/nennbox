import { AppButton, AppDialog, AppSelectionList } from '@nennbox/ui';
import type { useMessagesData } from './useMessagesData.js';

export type MessageAction =
  'send' | 'resend-verification' | 'remind-open-payments';
type Selection = ReturnType<typeof useMessagesData>['selection'];

const titles: Record<MessageAction, string> = {
  send: 'Nachricht senden?',
  'resend-verification': 'Verifizierung erneut senden?',
  'remind-open-payments': 'Offene Zahlungen erinnern?',
};
const scopes: Record<MessageAction, string> = {
  send: '',
  'resend-verification': ' ohne bestätigte E-Mail-Adresse',
  'remind-open-payments': ' mit offener Zahlung',
};

export function MessageConfirmDialog({
  action,
  selection,
  busy,
  ready,
  onCancel,
  onConfirm,
}: {
  action: MessageAction | null;
  selection: Selection;
  busy: boolean;
  ready: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppDialog
      open={Boolean(action)}
      title={action ? titles[action] : ''}
      closeLabel="Schließen"
      onClose={() => {
        if (!busy) onCancel();
      }}
      actions={
        <>
          <AppButton tone="secondary" disabled={busy} onClick={onCancel}>
            Abbrechen
          </AppButton>
          <AppButton
            tone="primary"
            disabled={busy || !ready}
            onClick={onConfirm}
          >
            Jetzt senden
          </AppButton>
        </>
      }
    >
      <p>
        {selection.loading
          ? 'Empfänger werden ermittelt…'
          : selection.error ||
            `Diese Aktion geht an ${selection.value.count} Empfänger innerhalb der sichtbaren Empfängerfilter${action ? scopes[action] : ''}.`}
      </p>
      <AppSelectionList label="Erste Empfänger">
        {selection.value.recipients.slice(0, 8).map((item) => (
          <span key={item.email}>
            {item.name || item.email} · {item.email}
          </span>
        ))}
      </AppSelectionList>
    </AppDialog>
  );
}
