import {
  templates,
  fingerprint,
  makeFilter,
  type Rule,
  type Preview,
} from './workbasketReminderModel.js';
import { WorkbasketCampaignResult } from './WorkbasketCampaignResult.js';
import { useEffect, useRef, useState } from 'react';
import {
  AppButton,
  Icon,
  AppDialog,
  AppNotice,
  AppSelectionList,
  AppTextInput,
  AppTextarea,
} from '@nennbox/ui';
import type { MessageCampaignRecord } from '@nennbox/contracts';
import { messagesApi } from '../messages/messagesApi.js';
import { errorText, freshRuleEntries } from './workbasketBulkApi.js';

export function WorkbasketReminder({
  eventId,
  ruleId,
  entryIds,
  onDone,
}: {
  eventId: string;
  ruleId: Rule;
  entryIds: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(templates[ruleId].subject);
  const [text, setText] = useState(templates[ruleId].text);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [campaign, setCampaign] = useState<MessageCampaignRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  const key = useRef<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  async function buildPreview() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const eligible = await freshRuleEntries(
        eventId,
        ruleId,
        controller.current.signal,
      );
      const ids = [...new Set(entryIds)].filter((id) => eligible.has(id));
      const filter = makeFilter(ids);
      const signal = controller.current.signal;
      const recipients = await messagesApi.recipients(eventId, filter, signal);
      if (!recipients.count)
        throw new Error(
          'Keine erreichbaren Empfänger in der aktuellen Auswahl.',
        );
      const rendered = await messagesApi.render(
        eventId,
        filter,
        subject,
        text,
        signal,
      );
      const reachable = new Set(
        recipients.recipients.map((recipient) => recipient.entryId),
      );
      setPreview({
        filter,
        recipients,
        rendered,
        skipped: [...new Set(entryIds)].filter(
          (id) => !ids.includes(id) || !reachable.has(id),
        ),
      });
      key.current = crypto.randomUUID();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send() {
    if (lock.current || !preview || !key.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      // On an uncertain response retain the same immutable body and idempotency key.
      // A retry then recovers the existing campaign rather than creating another one.
      if (!attempted) {
        const eligible = await freshRuleEntries(
          eventId,
          ruleId,
          controller.current.signal,
        );
        if (preview.filter.entryIds.some((id) => !eligible.has(id)))
          throw new Error(
            'Die Auswahl hat sich geändert. Bitte Vorschau neu erstellen.',
          );
        const latest = await messagesApi.recipients(
          eventId,
          preview.filter,
          controller.current.signal,
        );
        if (fingerprint(latest) !== fingerprint(preview.recipients))
          throw new Error(
            'Die Empfänger haben sich geändert. Bitte Vorschau neu erstellen.',
          );
      }
      controller.current.signal.throwIfAborted();
      setAttempted(true);
      setCampaign(
        await messagesApi.send(
          eventId,
          {
            eventId,
            recipients: preview.filter,
            subject,
            text,
            attachments: [],
          },
          key.current,
        ),
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refreshCampaign() {
    if (lock.current || !campaign) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const items = await messagesApi.campaigns(
        eventId,
        controller.current.signal,
      );
      const updated = items.find((item) => item.id === campaign.id);
      if (!updated)
        throw new Error(
          'Versandstatus noch nicht verfügbar. Bitte im Nachrichtenausgang prüfen.',
        );
      setCampaign(updated);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const close = () => {
    if (busy) return;
    setOpen(false);
    if (campaign || attempted) onDone();
  };
  return (
    <>
      <AppButton
        disabled={!entryIds.length || entryIds.length > 500}
        onClick={() => setOpen(true)}
      >
        <Icon name={ruleId === 'paymentOpen' ? 'payment' : 'document'} />
        {ruleId === 'paymentOpen'
          ? 'Zahlungserinnerung vorbereiten'
          : 'Unterlagen anfordern'}
      </AppButton>
      <AppDialog
        open={open}
        title={campaign ? 'Versandergebnis' : 'Erinnerung vorbereiten'}
        closeLabel="Schließen"
        onClose={close}
        actions={
          <>
            <AppButton tone="secondary" disabled={busy} onClick={close}>
              {campaign ? 'Fertig' : 'Schließen'}
            </AppButton>
            {!campaign && !attempted && (
              <AppButton
                disabled={busy || !subject.trim() || !text.trim()}
                onClick={() => void buildPreview()}
              >
                Vorschau erstellen
              </AppButton>
            )}
            {!campaign && preview && (
              <AppButton
                tone="primary"
                disabled={busy}
                onClick={() => void send()}
              >
                {attempted
                  ? 'Versandauftrag erneut abrufen'
                  : `Jetzt an ${preview.recipients.count} Empfänger senden`}
              </AppButton>
            )}
            {campaign && (
              <AppButton disabled={busy} onClick={() => void refreshCampaign()}>
                Versandstatus aktualisieren
              </AppButton>
            )}
          </>
        }
      >
        {error && <AppNotice tone="error">{error}</AppNotice>}
        {busy && <p role="status">Wird verarbeitet…</p>}
        {!campaign && (
          <>
            <p>
              {entryIds.length} ausgewählte Nennungen. Vor dem Versand werden
              aktuelle Aufgaben und erreichbare Empfänger geprüft. Noch wurde
              nichts gesendet.
            </p>
            <AppTextInput
              label="Betreff"
              value={subject}
              maxLength={998}
              disabled={busy || attempted}
              onChange={(event) => {
                setSubject(event.target.value);
                setPreview(null);
              }}
            />
            <AppTextarea
              label="Nachricht"
              value={text}
              maxLength={50000}
              rows={8}
              disabled={busy || attempted}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
              }}
            />
            {preview && (
              <>
                <h3>
                  Verbindliche Empfängervorschau: {preview.recipients.count}{' '}
                  Empfänger
                </h3>
                <p>
                  Die Nachricht wird ausschließlich an diese Auswahl beauftragt.
                  Der Versand läuft anschließend im Hintergrund.
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
                    Nicht mehr passend oder ohne erreichbare E-Mail (bei
                    gemeinsamer Adresse nur einmal angeschrieben):{' '}
                    {preview.skipped.join(', ')}
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
            )}
            {attempted && !campaign && (
              <AppNotice tone="warning">
                Der Versandauftrag wurde angefragt; das Ergebnis ist noch
                unklar. Erneutes Abrufen verwendet denselben Auftrag und erzeugt
                keinen zweiten Versand. Bitte nicht neu vorbereiten.
              </AppNotice>
            )}
          </>
        )}
        {campaign && <WorkbasketCampaignResult campaign={campaign} />}
      </AppDialog>
    </>
  );
}
