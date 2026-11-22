import { useRef, useState } from 'react';
import {
  AppButton,
  AppDialog,
  AppView,
  AppSection,
  AppActions,
  AppNotice,
  MessageLayout,
} from '@nennbox/ui';
import {
  MessageRecipientFilterSchema,
  type MessageAttachmentRecord,
  type MessageRecipientFilter,
} from '@nennbox/contracts';
import type { MessageSeed } from './messageSeed.js';
import { MessageRecipients } from './MessageRecipients.js';
import { MessageComposer } from './MessageComposer.js';
import { MessageOutbox } from './MessageOutbox.js';
import { MessageApiError, messagesApi } from './messagesApi.js';
import { useMessagesData } from './useMessagesData.js';

const emptyFilter = (): MessageRecipientFilter =>
  MessageRecipientFilterSchema.parse({});
type Action = 'send' | 'resend-verification' | 'remind-open-payments';
export function AdminMessages({
  eventId,
  seed,
}: {
  eventId: string;
  seed?: MessageSeed | undefined;
}) {
  const [filter, setFilter] = useState<MessageRecipientFilter>(() => ({
    ...emptyFilter(),
    entryIds: seed ? [seed.entryId] : [],
  }));
  const [search, setSearch] = useState('');
  const [addresses, setAddresses] = useState('');
  const [subject, setSubject] = useState(seed?.subject ?? '');
  const [body, setBody] = useState(seed?.body ?? '');
  const [attachments, setAttachments] = useState<MessageAttachmentRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const key = useRef(crypto.randomUUID());
  const activeEvent = useRef(eventId);
  const flight = useRef(false);
  const data = useMessagesData(eventId, filter, subject, body, revision);
  const addressesError =
    addresses.trim() &&
    filter.additionalAddresses.length !==
      addresses.split(/[\s,;]+/).filter(Boolean).length
      ? 'Bitte gültige E-Mail-Adressen eingeben.'
      : '';
  const canSend = Boolean(
    eventId &&
    data.selection.value.count &&
    subject.trim() &&
    body.trim() &&
    !addressesError &&
    !busy &&
    !data.selection.loading &&
    !data.rendered.loading &&
    data.rendered.value &&
    !data.rendered.error,
  );
  function updateContent(setter: (value: string) => void, value: string) {
    setter(value);
    key.current = crypto.randomUUID();
  }
  function changeFilter(value: MessageRecipientFilter) {
    setFilter(value);
    key.current = crypto.randomUUID();
  }
  async function execute() {
    if (!confirm || flight.current) return;
    const action = confirm;
    const currentEvent = eventId;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'send') {
        if (!canSend) return;
        await messagesApi.send(
          eventId,
          {
            eventId,
            recipients: filter,
            subject,
            text: body,
            attachments: attachments.map(({ objectId, filename }) => ({
              objectId,
              filename,
            })),
          },
          key.current,
        );
        key.current = crypto.randomUUID();
      } else await messagesApi.quickAction(eventId, action);
      if (activeEvent.current === currentEvent) {
        setConfirm(null);
        setNotice('Nachricht wurde für den Versand eingeplant.');
        setRevision((value) => value + 1);
      }
    } catch (caught) {
      if (activeEvent.current === currentEvent)
        setError(
          caught instanceof MessageApiError
            ? `${caught.message}${caught.details.length ? `: ${caught.details.join(', ')}` : ''}`
            : 'Versand fehlgeschlagen. Prüfe deine Verbindung und versuche es erneut.',
        );
    } finally {
      if (activeEvent.current === currentEvent) {
        setBusy(false);
        flight.current = false;
      }
    }
  }
  return (
    <AppView>
      <MessageLayout
        editor={
          <>
            {error && <AppNotice tone="error">{error}</AppNotice>}
            {notice && <p role="status">{notice}</p>}
            <MessageRecipients
              filter={filter}
              onChange={changeFilter}
              classes={data.classes.value}
              candidates={data.candidates.value}
              selection={data.selection.value}
              loading={data.selection.loading}
              search={search}
              onSearch={setSearch}
              addresses={addresses}
              onAddresses={(value) => {
                setAddresses(value);
                changeFilter({
                  ...filter,
                  additionalAddresses: value
                    .split(/[\s,;]+/)
                    .filter(Boolean)
                    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
                });
              }}
            />
            {addressesError && (
              <AppNotice tone="error">{addressesError}</AppNotice>
            )}
            <MessageComposer
              eventId={eventId}
              templates={data.templates.value}
              subject={subject}
              text={body}
              onSubject={(value) => updateContent(setSubject, value)}
              onText={(value) => updateContent(setBody, value)}
              attachments={attachments}
              onAttachments={(value) => {
                setAttachments(value);
                key.current = crypto.randomUUID();
              }}
            />
            <AppActions>
              <AppButton
                tone="primary"
                disabled={!canSend}
                onClick={() => setConfirm('send')}
              >
                Nachricht senden
              </AppButton>
              <AppButton
                tone="secondary"
                onClick={() => setConfirm('resend-verification')}
              >
                Verifizierung erneut senden
              </AppButton>
              <AppButton
                tone="secondary"
                onClick={() => setConfirm('remind-open-payments')}
              >
                Offene Zahlungen erinnern
              </AppButton>
            </AppActions>
          </>
        }
        aside={
          <>
            <AppSection title="Empfängervorschau">
              <p>
                {data.selection.loading
                  ? 'Wird geladen…'
                  : `${data.selection.value.count} Empfänger`}
              </p>
              <ul>
                {data.selection.value.recipients.map((item) => (
                  <li key={item.email}>
                    {item.name || item.email} · {item.email}
                  </li>
                ))}
              </ul>
            </AppSection>
            <AppSection title="Nachrichtenvorschau">
              <p>
                Platzhalter: {'{{firstName}}'}, {'{{lastName}}'},{' '}
                {'{{fullName}}'}, {'{{email}}'}, {'{{eventName}}'},{' '}
                {'{{className}}'}, {'{{entryNumber}}'}
              </p>
              {data.rendered.loading && (
                <p role="status">Vorschau wird geladen…</p>
              )}
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
        }
        footer={
          <>
            <MessageOutbox
              campaigns={data.campaigns.value}
              onChanged={() => setRevision((value) => value + 1)}
            />
            <AppDialog
              open={Boolean(confirm)}
              title={
                confirm === 'send'
                  ? 'Nachricht senden?'
                  : confirm === 'resend-verification'
                    ? 'Verifizierung erneut senden?'
                    : 'Offene Zahlungen erinnern?'
              }
              closeLabel="Schließen"
              onClose={() => {
                if (!busy) setConfirm(null);
              }}
              actions={
                <>
                  <AppButton
                    tone="secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Abbrechen
                  </AppButton>
                  <AppButton
                    tone="primary"
                    disabled={busy || (confirm === 'send' && !canSend)}
                    onClick={() => void execute()}
                  >
                    Jetzt senden
                  </AppButton>
                </>
              }
            >
              <p>
                {confirm === 'send'
                  ? `Diese Nachricht geht an ${data.selection.value.count} Empfänger.`
                  : 'Die Aktion erstellt eine Nachricht an die betroffenen Empfänger.'}
              </p>
            </AppDialog>
          </>
        }
      />
    </AppView>
  );
}
