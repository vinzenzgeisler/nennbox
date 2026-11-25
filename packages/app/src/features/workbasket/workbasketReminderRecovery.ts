import { freshRuleEntries } from './workbasketBulkApi.js';
import { messagesApi } from '../messages/messagesApi.js';
import { z } from 'zod';
import { useRef, useState } from 'react';
import {
  MessageCampaignCreateSchema,
  MessageCampaignRecordSchema,
  MessageRecipientFilterSchema,
  MessageRecipientPreviewSchema,
  MessageRenderedPreviewSchema,
} from '@nennbox/contracts';
import {
  makeWorkbasketConfirmation,
  fingerprint,
  type Rule,
  type Preview,
} from './workbasketReminderModel.js';

const RecoverySchema = z.object({
  version: z.literal(1),
  eventId: z.string(),
  ruleId: z.enum(['paymentOpen', 'missingDocuments']),
  key: z.string().uuid(),
  body: MessageCampaignCreateSchema,
  preview: z.object({
    filter: MessageRecipientFilterSchema,
    recipients: MessageRecipientPreviewSchema,
    rendered: MessageRenderedPreviewSchema,
    skipped: z.array(z.string()),
  }),
  status: z.enum(['uncertain', 'known']),
  campaign: MessageCampaignRecordSchema.nullable(),
});
export type ReminderRecovery = z.infer<typeof RecoverySchema>;
const storageKey = (eventId: string, ruleId: Rule) =>
  `nennbox:workbasket-reminder:v1:${eventId}:${ruleId}`;

// Session scope survives navigation/reload without sharing recipient data across tabs.
// Storage failures must block a new send: a request without durable identity is unsafe.
export function readReminderRecovery(eventId: string, ruleId: Rule) {
  const raw = sessionStorage.getItem(storageKey(eventId, ruleId));
  if (!raw) return null;
  const recovery = RecoverySchema.parse(JSON.parse(raw));
  if (
    recovery.eventId !== eventId ||
    recovery.ruleId !== ruleId ||
    recovery.body.eventId !== eventId ||
    (recovery.status === 'known') !== Boolean(recovery.campaign)
  )
    throw new Error('Ungültiger gespeicherter Versandauftrag.');
  return recovery;
}
export function writeReminderRecovery(recovery: ReminderRecovery) {
  sessionStorage.setItem(
    storageKey(recovery.eventId, recovery.ruleId),
    JSON.stringify(recovery),
  );
}
export function clearReminderRecovery(eventId: string, ruleId: Rule) {
  sessionStorage.removeItem(storageKey(eventId, ruleId));
}

export function useReminderRecovery(eventId: string, ruleId: Rule) {
  const [restored] = useState(() => {
    try {
      return { recovery: readReminderRecovery(eventId, ruleId), error: '' };
    } catch {
      return {
        recovery: null,
        error:
          'Gespeicherter Versandauftrag nicht lesbar. Bitte im Nachrichtenausgang prüfen; kein neuer Versand möglich.',
      };
    }
  });
  const [recovery, setRecovery] = useState<ReminderRecovery | null>(
    restored.recovery,
  );
  const dismissed = useRef(false);
  return {
    dismissCampaign() {
      clearReminderRecovery(eventId, ruleId);
      dismissed.current = true;
    },
    recovery,
    storageError: restored.error,
    discardRejectedAttempt() {
      clearReminderRecovery(eventId, ruleId);
      setRecovery(null);
    },
    recordAttempt(
      preview: Preview,
      subject: string,
      text: string,
      key: string,
    ) {
      const request: ReminderRecovery = recovery ?? {
        version: 1,
        eventId,
        ruleId,
        key,
        body: {
          eventId,
          recipients: preview.filter,
          subject,
          text,
          attachments: [],
          workbasketConfirmation: makeWorkbasketConfirmation(
            ruleId,
            preview.recipients,
          ),
        },
        preview,
        status: 'uncertain',
        campaign: null,
      };
      // Write before POST: remounts must recover even when its response is lost.
      writeReminderRecovery(request);
      setRecovery(request);
      return request;
    },
    recordCampaign(
      campaign: NonNullable<ReminderRecovery['campaign']>,
      request = recovery,
    ) {
      if (!request || dismissed.current) return;
      const known: ReminderRecovery = { ...request, status: 'known', campaign };
      writeReminderRecovery(known);
      setRecovery(known);
    },
  };
}

export async function validateReminderConfirmation(
  eventId: string,
  ruleId: Rule,
  preview: Preview,
  signal: AbortSignal,
) {
  const eligible = await freshRuleEntries(eventId, ruleId, signal);
  if (preview.filter.entryIds.some((id) => !eligible.has(id)))
    throw new Error(
      'Die Auswahl hat sich geändert. Bitte Vorschau neu erstellen.',
    );
  const latest = await messagesApi.recipients(eventId, preview.filter, signal);
  if (fingerprint(latest) !== fingerprint(preview.recipients))
    throw new Error(
      'Die Empfänger haben sich geändert. Bitte Vorschau neu erstellen.',
    );
}
