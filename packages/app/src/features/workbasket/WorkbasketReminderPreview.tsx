import { AppNotice, AppSelectionList } from '@nennbox/ui';
import type { Preview } from './workbasketReminderModel.js';

export function WorkbasketReminderPreview({ preview }: { preview: Preview }) {
  return (
    <>
      <h3>
        Verbindliche Empfängervorschau: {preview.recipients.count} Empfänger
      </h3>
      <p>
        Die Nachricht wird ausschließlich an diese Auswahl beauftragt. Der
        Versand läuft anschließend im Hintergrund.
      </p>
      <AppSelectionList label="Empfänger">
        {preview.recipients.recipients.map((recipient) => (
          <span key={recipient.email}>
            {recipient.name} · {recipient.email}
          </span>
        ))}
      </AppSelectionList>
      {preview.skipped.length > 0 && (
        <AppNotice tone="warning">
          Nicht mehr passend oder ohne erreichbare E-Mail (bei gemeinsamer
          Adresse nur einmal angeschrieben): {preview.skipped.join(', ')}
        </AppNotice>
      )}
      <h3>Nachrichtenvorschau</h3>
      <p>
        Beispiel für {preview.rendered.recipient.name} ·{' '}
        {preview.rendered.recipient.email}
      </p>
      <strong>{preview.rendered.subject}</strong>
      <pre className="nb-workbasket-message-preview">
        {preview.rendered.text}
      </pre>
    </>
  );
}
