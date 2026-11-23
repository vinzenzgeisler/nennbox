import { AppNotice, AppSection, AppSelectionList } from '@nennbox/ui';
import type { useMessagesData } from './useMessagesData.js';

type Data = ReturnType<typeof useMessagesData>;

export function MessagePreviewPanel({ data }: { data: Data }) {
  return (
    <>
      <AppSection title="Empfängervorschau">
        <p>
          {data.selection.loading
            ? 'Wird geladen…'
            : data.selection.error
              ? 'Empfängervorschau nicht verfügbar'
              : `${data.selection.value.count} Empfänger`}
        </p>
        <AppSelectionList label="Empfängervorschau">
          {data.selection.value.recipients.slice(0, 8).map((item) => (
            <span key={item.email}>
              {item.name || item.email} · {item.email}
            </span>
          ))}
        </AppSelectionList>
        {data.selection.value.count > 8 && (
          <p>und {data.selection.value.count - 8} weitere</p>
        )}
      </AppSection>
      <AppSection title="Nachrichtenvorschau">
        {data.rendered.loading && <p role="status">Vorschau wird geladen…</p>}
        {data.rendered.error && (
          <AppNotice tone="error">{data.rendered.error}</AppNotice>
        )}
        {data.rendered.value && (
          <>
            <p>
              An: {data.rendered.value.recipient.name} ·{' '}
              {data.rendered.value.recipient.email}
            </p>
            <h3>{data.rendered.value.subject}</h3>
            <p>{data.rendered.value.text}</p>
          </>
        )}
      </AppSection>
    </>
  );
}
