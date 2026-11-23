import { useEffect, useRef, useState } from 'react';
import {
  AppButton,
  AppView,
  AppActions,
  AppNotice,
  MessageLayout,
} from '@nennbox/ui';
import { type MessageRecipientFilter } from '@nennbox/contracts';
import type { MessageSeed } from './messageSeed.js';
import { MessageRecipients } from './MessageRecipients.js';
import { MessageComposer } from './MessageComposer.js';
import { MessageOutbox } from './MessageOutbox.js';
import {
  MessageConfirmDialog,
  type MessageAction,
} from './MessageConfirmDialog.js';
import { MessagePreviewPanel } from './MessagePreviewPanel.js';
import { MessageApiError, messagesApi } from './messagesApi.js';
import { useMessagesData } from './useMessagesData.js';
import { useMessageDraft } from './useMessageDraft.js';

type Action = MessageAction;
export function AdminMessages(props: {
  eventId: string;
  seed?: MessageSeed | undefined;
}) {
  return <EventMessages key={props.eventId} {...props} />;
}
function EventMessages({
  eventId,
  seed,
}: {
  eventId: string;
  seed?: MessageSeed | undefined;
}) {
  const { draft, setDraft, seedKept } = useMessageDraft(eventId, seed);
  const { filter, search, addresses, subject, body, attachments } = draft;
  const setField = <K extends keyof typeof draft>(
    field: K,
    value: (typeof draft)[K],
  ) => setDraft((current) => ({ ...current, [field]: value }));
  const setSubject = (value: string) => setField('subject', value);
  const setBody = (value: string) => setField('body', value);
  const [uploading, setUploading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const key = useRef(crypto.randomUUID());
  const activeEvent = useRef(eventId);
  useEffect(() => {
    activeEvent.current = eventId;
    return () => {
      activeEvent.current = '';
    };
  }, [eventId]);
  const flight = useRef(false);
  const data = useMessagesData(eventId, filter, subject, body, revision);
  const actionSelection =
    confirm === 'remind-open-payments'
      ? data.paymentSelection
      : confirm === 'resend-verification'
        ? data.verificationSelection
        : data.selection;
  const actionReady =
    !actionSelection.loading &&
    !actionSelection.error &&
    actionSelection.value.count > 0;
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
    !uploading &&
    !data.selection.error &&
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
    setField('filter', value);
    key.current = crypto.randomUUID();
  }
  async function execute() {
    if (!confirm || flight.current || !actionReady) return;
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
      } else await messagesApi.quickAction(eventId, action, filter);
      if (activeEvent.current === currentEvent) {
        // A sent message is no draft any more; keep the recipient filter for the next one.
        if (action === 'send')
          setDraft((current) => ({
            ...current,
            subject: '',
            body: '',
            attachments: [],
          }));
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
            {/* The rendered preview reports its own error inside the preview panel. */}
            {Object.entries(data).map(
              ([name, request]) =>
                name !== 'rendered' &&
                request.error && (
                  <AppNotice key={name} tone="error">
                    {request.error}
                  </AppNotice>
                ),
            )}
            {seedKept && (
              <AppNotice tone="info">
                Ein ungesendeter Entwurf wurde beibehalten. Die gewählte Nennung
                wurde nicht übernommen.
              </AppNotice>
            )}
            {error && <AppNotice tone="error">{error}</AppNotice>}
            {notice && <p role="status">{notice}</p>}
            <MessageRecipients
              filter={filter}
              onChange={changeFilter}
              classes={data.classes.value}
              statuses={data.workflow.value}
              candidates={data.candidates.value}
              selection={data.selection.value}
              loading={data.selection.loading}
              error={data.selection.error}
              search={search}
              onSearch={(value) => setField('search', value)}
              addresses={addresses}
              onAddresses={(value) => {
                setField('addresses', value);
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
              onUploading={setUploading}
              onAttachments={(value) => {
                setField('attachments', value);
                key.current = crypto.randomUUID();
              }}
            />
            <AppActions>
              <AppButton
                tone="ghost"
                disabled={busy || uploading}
                onClick={() => {
                  if (
                    window.confirm(
                      'Entwurf mit Text und Anhängen wirklich verwerfen?',
                    )
                  ) {
                    setDraft({
                      ...draft,
                      subject: '',
                      body: '',
                      attachments: [],
                    });
                  }
                }}
              >
                Entwurf verwerfen
              </AppButton>
              <AppButton
                tone="primary"
                disabled={!canSend}
                onClick={() => setConfirm('send')}
              >
                Nachricht senden
              </AppButton>
              <AppButton
                tone="secondary"
                disabled={
                  busy ||
                  data.verificationSelection.loading ||
                  Boolean(data.verificationSelection.error)
                }
                onClick={() => setConfirm('resend-verification')}
              >
                Verifizierung erneut senden
              </AppButton>
              <AppButton
                tone="secondary"
                disabled={
                  busy ||
                  data.paymentSelection.loading ||
                  Boolean(data.paymentSelection.error)
                }
                onClick={() => setConfirm('remind-open-payments')}
              >
                Offene Zahlungen erinnern
              </AppButton>
            </AppActions>
          </>
        }
        aside={<MessagePreviewPanel data={data} />}
        footer={
          <>
            <MessageOutbox
              campaigns={data.campaigns.value}
              onChanged={() => setRevision((value) => value + 1)}
            />
            <MessageConfirmDialog
              action={confirm}
              selection={actionSelection}
              busy={busy}
              ready={actionReady && (confirm !== 'send' || Boolean(canSend))}
              onCancel={() => setConfirm(null)}
              onConfirm={() => void execute()}
            />
          </>
        }
      />
    </AppView>
  );
}
