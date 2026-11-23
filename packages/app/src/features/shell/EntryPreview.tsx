import { assignedNumber } from '../entries/entryStartNumber.js';
import { EntryDataHints } from '../entries/EntryDataHints.js';
import { formatEntryHistoryLabel } from '../entries/EntryHistoryLabel.js';
import { completionStates } from '../entries/completionStates.js';
import { useState, type ReactNode } from 'react';
import { dimensionStatus } from '../entries/dimensionStatus.js';
import type {
  EntryResponse as Entry,
  EntryWorkflowCategory,
} from '@nennbox/contracts';
import {
  AppButton,
  AdmissionChecklist,
  AppStatusPill,
  DocumentList,
  KeyboardHintBar,
  PreviewPanel,
  StatusLabel,
} from '@nennbox/ui';
import type { WorkflowView } from '../entries/AdminEntriesModel.js';
import {
  documentStatusView,
  uploadLines,
} from '../entries/documents/documentLines.js';

const STATUS_DOCUMENT_KEYS = ['waiver', 'payment'] as const;
type StatusDocumentKey = (typeof STATUS_DOCUMENT_KEYS)[number];
function isStatusDocumentKey(key: string): key is StatusDocumentKey {
  return STATUS_DOCUMENT_KEYS.some((candidate) => candidate === key);
}

/** Workflow categories the preview may advance an entry into; terminal outcomes stay in the detail view. */
const PREVIEW_PROGRESS_CATEGORIES: readonly EntryWorkflowCategory[] = [
  'pending',
  'accepted',
  'waitlisted',
];

const STATUS_DOCUMENT_LABELS: Record<StatusDocumentKey, string> = {
  waiver: 'Haftverzicht Fahrer',
  payment: 'Startgeld',
};

export function EntryPreview({
  entry,
  workflow,
  onNextAction,
  onClose,
  onOpenDetail,
  onMessage,
  busy,
  feedback,
}: {
  entry: Entry;
  workflow: WorkflowView | null;
  onNextAction: (status: string) => Promise<void>;
  onClose: () => void;
  onOpenDetail: () => void;
  onMessage: () => void;
  busy: boolean;
  feedback?: ReactNode;
}) {
  const [now] = useState(() => Date.now());
  const details = entry.adminDetails;
  const status = entry.statusProjection?.dimensions;
  const next = status?.find((item) => item.key === 'entry')?.nextAction;
  const nextStatus = next?.key.startsWith('entry:') ? next.key.slice(6) : null;
  const nextCategory = workflow?.statuses.find(
    (item) => (item.id ?? item.key) === nextStatus,
  )?.category;
  const canAcceptNext = nextCategory === 'accepted';
  const canAdvance = Boolean(
    nextStatus &&
    PREVIEW_PROGRESS_CATEGORIES.some((category) => category === nextCategory),
  );
  const missingDimensions =
    status
      ?.filter(
        (item) =>
          ['payment', 'technical_inspection', 'waiver'].includes(item.key) &&
          item.required &&
          item.meaning !== 'done' &&
          item.meaning !== 'not_relevant',
      )
      .map((item) =>
        item.key === 'payment'
          ? 'Zahlung'
          : item.key === 'technical_inspection'
            ? 'Abnahme'
            : 'Haftverzicht',
      ) ?? [];
  const missing = [
    ...missingDimensions,
    ...uploadLines(entry)
      .filter((line) => line.required && line.status === 'missing')
      .map((line) => line.label),
  ];
  const documents =
    details?.customAnswers
      .filter((answer) => answer.fileDownloadUrl)
      .map((answer) => ({
        id: answer.key,
        label: answer.label,
        href: answer.fileDownloadUrl!,
        status: <StatusLabel status="done" label="Vorhanden" />,
      })) ?? [];
  const statusDocuments =
    status
      ?.filter((item): item is typeof item & { key: StatusDocumentKey } =>
        isStatusDocumentKey(item.key),
      )
      .map((item) => ({
        id: item.key,
        label: STATUS_DOCUMENT_LABELS[item.key],
        status: (
          <StatusLabel
            status={
              item.meaning === 'not_relevant'
                ? 'empty'
                : dimensionStatus(item.key, item.meaning)
            }
            label={item.label.de}
          />
        ),
      })) ?? [];
  const typedDocuments = uploadLines(entry).map((line) => {
    const view = documentStatusView(line.status);
    return {
      id: `document-${line.key}`,
      label: line.label,
      status: <StatusLabel status={view.status} label={view.label} />,
    };
  });
  const allDocuments = [...typedDocuments, ...documents, ...statusDocuments];
  return (
    <PreviewPanel
      eyebrow="Vorschau"
      number={assignedNumber(entry)}
      title={details?.driver.name ?? 'Name nicht verfügbar'}
      subtitle={
        details
          ? [
              `${details.vehicle.make} ${details.vehicle.model}`,
              details.eventClass.name,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'Fahrzeug nicht verfügbar'
      }
      imageUrl={details?.vehicle.imageUrl ?? null}
      imageAlt="Fahrzeugbild"
      labels={
        <>
          <AppStatusPill
            status={
              (
                {
                  accepted: 'zu',
                  waitlisted: 'vor',
                  rejected: 'neg',
                  withdrawn: 'ab',
                } as const
              )[
                workflow?.statuses.find(
                  (item) => (item.id ?? item.key) === entry.acceptanceStatus,
                )?.category as
                  'accepted' | 'waitlisted' | 'rejected' | 'withdrawn'
              ] ?? 'offen'
            }
          >
            {status?.find((item) => item.key === 'entry')?.label.de ??
              workflow?.statuses.find(
                (item) => (item.id ?? item.key) === entry.acceptanceStatus,
              )?.labels.de ??
              entry.acceptanceStatus}
          </AppStatusPill>
          <EntryDataHints entry={entry} />
          {entry.orgaCode && (
            <span className="nb-preview-code">
              Orga-Code <code>{entry.orgaCode}</code>
            </span>
          )}
        </>
      }
      onClose={onClose}
      onOpen={onOpenDetail}
      closeLabel="Vorschau schließen"
      footer={
        <div className="nb-preview-actions">
          <div className="nb-preview-action-row">
            {canAdvance && nextStatus && next && (
              <AppButton
                tone="primary"
                disabled={busy}
                onClick={() => void onNextAction(nextStatus)}
              >
                {nextStatus === 'accepted' ? 'Zulassen' : next.label.de}
              </AppButton>
            )}
            <AppButton onClick={onMessage}>Unterlagen anfordern</AppButton>
          </div>
          {canAdvance && canAcceptNext && nextStatus && missing.length > 0 && (
            <p className="nb-preview-hint">
              {missing.length === 1
                ? `${missing[0]} fehlt noch. Du kannst trotzdem zulassen.`
                : `${missing.join(', ')} fehlen noch. Du kannst trotzdem zulassen.`}
            </p>
          )}
        </div>
      }
      recent={
        <section className="nb-preview-recent">
          <h3>Zuletzt</h3>
          {(entry.adminHistory ?? [])
            .slice(-3)
            .reverse()
            .map((item) => (
              <p key={item.id}>
                <span>
                  {formatEntryHistoryLabel(item.kind, item.label, workflow)}
                </span>
                <time dateTime={item.occurredAt}>
                  {new Intl.RelativeTimeFormat('de', {
                    numeric: 'auto',
                  }).format(
                    Math.round(
                      (new Date(item.occurredAt).getTime() - now) / 3600000,
                    ),
                    'hour',
                  )}
                </time>
              </p>
            ))}
          {!(entry.adminHistory ?? []).length && (
            <p>
              <span>Nennung eingereicht</span>
              <time dateTime={entry.createdAt}>
                {new Intl.RelativeTimeFormat('de', { numeric: 'auto' }).format(
                  Math.round(
                    (new Date(entry.createdAt).getTime() - now) / 86400000,
                  ),
                  'day',
                )}
              </time>
            </p>
          )}
        </section>
      }
      hints={
        <KeyboardHintBar
          items={[
            { keys: '↑ ↓', label: 'wechseln' },
            { keys: 'Enter', label: 'öffnen' },
            { keys: 'Esc', label: 'schließen' },
          ]}
        />
      }
    >
      {feedback}
      <AdmissionChecklist states={completionStates(entry)} />
      {allDocuments.length > 0 && (
        <details className="nb-preview-documents">
          <summary>Unterlagen ansehen</summary>
          <DocumentList title="Unterlagen" items={allDocuments} />
        </details>
      )}
    </PreviewPanel>
  );
}
