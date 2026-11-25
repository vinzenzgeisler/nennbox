import { WorkbasketReminderPreview } from './WorkbasketReminderPreview.js';
import {
  useReminderRecovery,
  validateReminderConfirmation,
} from './workbasketReminderRecovery.js';
import { templates, makeFilter, type Rule } from './workbasketReminderModel.js';
import { WorkbasketCampaignResult } from './WorkbasketCampaignResult.js';
import { useEffect, useRef, useState } from 'react';
import {
  AppButton,
  Icon,
  AppDialog,
  AppNotice,
  AppTextInput,
  AppTextarea,
} from '@nennbox/ui';
import { MessageApiError, messagesApi } from '../messages/messagesApi.js';
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
  const {
    recovery,
    storageError,
    recordAttempt,
    recordCampaign,
    dismissCampaign,
    discardRejectedAttempt,
  } = useReminderRecovery(eventId, ruleId);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(
    recovery?.body.subject ?? templates[ruleId].subject,
  );
  const [text, setText] = useState(
    recovery?.body.text ?? templates[ruleId].text,
  );
  const [preview, setPreview] = useState(recovery?.preview ?? null);
  const campaign = recovery?.campaign ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(storageError);
  const lock = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  const key = useRef<string | null>(recovery?.key ?? null);
  const attempted = Boolean(recovery);
  async function buildPreview() {
    if (lock.current || attempted || storageError) return;
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
    if (lock.current || storageError || !preview || !key.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      // On an uncertain response retain the same immutable body and idempotency key.
      // A retry then recovers the existing campaign rather than creating another one.
      if (!attempted)
        await validateReminderConfirmation(
          eventId,
          ruleId,
          preview,
          controller.current.signal,
        );
      controller.current.signal.throwIfAborted();
      const request = recordAttempt(preview, subject, text, key.current);
      const result = await messagesApi.send(eventId, request.body, request.key);
      recordCampaign(result, request);
    } catch (cause) {
      if (
        cause instanceof MessageApiError &&
        cause.code === 'confirmation-changed'
      ) {
        // This response proves enqueue was rejected, unlike a lost/uncertain response.
        discardRejectedAttempt();
        setPreview(null);
        key.current = null;
      }
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
      recordCampaign(updated);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const canClose = !busy || Boolean(campaign);
  const close = () => {
    if (!canClose) return;
    if (campaign) {
      try {
        dismissCampaign();
      } catch (cause) {
        setError(errorText(cause));
        return;
      }
    }
    setOpen(false);
    if (campaign || attempted) onDone();
  };
  return (
    <>
      <AppButton
        disabled={!attempted && (!entryIds.length || entryIds.length > 500)}
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
            <AppButton tone="secondary" disabled={!canClose} onClick={close}>
              {campaign ? 'Fertig' : 'Schließen'}
            </AppButton>
            {!campaign && !attempted && (
              <AppButton
                disabled={
                  busy ||
                  Boolean(storageError) ||
                  !subject.trim() ||
                  !text.trim()
                }
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
              {recovery?.body.recipients.entryIds.length ?? entryIds.length}{' '}
              ausgewählte Nennungen. Vor dem Versand werden aktuelle Aufgaben
              und erreichbare Empfänger geprüft.
              {attempted
                ? 'Ergebnis des bisherigen Versandauftrags siehe unten.'
                : 'Noch wurde nichts gesendet.'}
            </p>
            <AppTextInput
              label="Betreff"
              value={subject}
              maxLength={998}
              disabled={busy || attempted || Boolean(storageError)}
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
              disabled={busy || attempted || Boolean(storageError)}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
              }}
            />
            {preview && <WorkbasketReminderPreview preview={preview} />}
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
