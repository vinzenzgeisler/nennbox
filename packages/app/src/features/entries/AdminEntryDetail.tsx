import { EntryDetailDialogs } from './detail/EntryDetailDialogs.js';
import { entryStatusDialog } from './detail/entryStatusDialog.js';
import { EntryDetailContent } from './detail/EntryDetailContent.js';
import { useMemo, useState } from 'react';
import { AppButton, EntryDetailPage, Menu } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { Outcome, WorkflowView } from './AdminEntriesModel.js';
import type { Pending } from './detail/EntryDetailPending.js';
import { EntryActionRail } from './detail/EntryActionRail.js';
import type { UploadLine } from './documents/documentLines.js';
import { requestMessageSeed } from './documents/requestMessage.js';
import { useEntryDocumentActions } from './documents/useEntryDocumentActions.js';
import type { MessageSeed } from '../messages/messageSeed.js';
import { timelineFor } from './detail/entryDetailModel.js';
import { EntryAdmissionProgress } from './detail/EntryAdmissionProgress.js';
import { EntryProperties } from './detail/EntryProperties.js';
import { EntryStatusToast } from './EntryStatusToast.js';
import { uploadLines } from './documents/documentLines.js';
import { EntryDetailActions } from './detail/EntryDetailActions.js';
import { EntryDetailHeader } from './detail/EntryDetailHeader.js';
import { useEntryDetailApi } from './detail/useEntryDetailApi.js';
import {
  useDimensionLabels,
  useEntryMessages,
} from './detail/useEntryDetailReads.js';

export function AdminEntryDetail({
  selected,
  classes,
  workflow,
  busy,
  error,
  transition,
  onBack,
  onUpdated,
  onMessage,
  navigation,
  onChangeStatus,
  onNotice,
}: {
  onNotice?: (message: string) => void;
  navigation?: import('react').ReactNode;
  onChangeStatus?: (entry: Entry, status: string) => Promise<void>;
  selected: Entry;
  classes: Array<{ id: string; name: string; closed?: boolean }>;
  workflow: WorkflowView | null;
  busy: boolean;
  error: string;
  transition: (
    type: 'acceptance' | 'verification',
    status: string,
    reason: string,
  ) => Promise<Outcome>;
  onBack: () => void;
  onUpdated: (entry: Entry | null, refresh?: boolean) => void;
  onMessage?: ((seed: MessageSeed) => void) | undefined;
}) {
  const [tab, setTab] = useState('overview');
  const [numberOpen, setNumberOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const notify = (message: string) =>
    onNotice ? onNotice(message) : setNotice({ message });
  const api = useEntryDetailApi(selected, onUpdated, () =>
    notify('Änderung gespeichert'),
  );
  const documents = useEntryDocumentActions(api);
  const writeMessage = onMessage && (() => onMessage({ entryId: selected.id }));
  const requestDocument =
    onMessage &&
    ((line: UploadLine) => onMessage(requestMessageSeed(selected.id, line)));
  const messages = useEntryMessages(selected);
  const dimensionLabels = useDimensionLabels(selected.eventId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogError, setDialogError] = useState('');
  const details = selected.adminDetails;
  const timeline = useMemo(
    () => timelineFor(selected, workflow, dimensionLabels),
    [selected, workflow, dimensionLabels],
  );
  if (!details)
    return <p role="alert">Die Details dieser Nennung sind nicht verfügbar.</p>;
  const close = () => {
    setPending(null);
    setDialogError('');
  };
  async function confirm(reason: string, amountCents?: number) {
    if (!pending) return;
    setDialogError('');
    if (
      pending.kind === 'payment' &&
      amountCents !== undefined &&
      details?.invoice
    ) {
      const result = await api.recordPayment(
        details.invoice.id,
        amountCents,
        reason,
      );
      return result.ok ? close() : setDialogError(result.message);
    }
    if (pending.kind === 'dimension') {
      const result = await api.transitionDimension(
        pending.action.dimension,
        pending.action.status,
        reason,
      );
      return result.ok ? close() : setDialogError(result.message);
    }
    const result =
      pending.kind === 'verify'
        ? await transition('verification', 'verified', reason)
        : pending.kind === 'status'
          ? await transition('acceptance', pending.step.to, reason)
          : null;
    if (result?.ok) {
      notify('Änderung gespeichert');
      close();
    } else if (result) setDialogError(result.message);
  }
  async function confirmAdminAction(
    action: Parameters<typeof api.performAdminAction>[0],
  ) {
    const result = await api.performAdminAction(action);
    if (!result.ok) setDialogError(result.message);
    else if (action.kind === 'delete') {
      notify('Nennung gelöscht');
      onUpdated(null);
      onBack();
    } else close();
  }
  const dialog = entryStatusDialog(pending, workflow);
  const changeDetailStatus = (
    step: import('./detail/EntryActionRail.js').StatusStep,
  ) => {
    const edge = workflow?.transitions.find(
      (item) => item.from === selected.acceptanceStatus && item.to === step.to,
    );
    const reversible =
      edge &&
      !edge.notify &&
      workflow?.transitions.some(
        (item) =>
          item.from === step.to &&
          item.to === selected.acceptanceStatus &&
          !item.notify,
      );
    if (reversible && onChangeStatus) void onChangeStatus(selected, step.to);
    else setPending({ kind: 'status', step });
  };

  return (
    <section aria-label="Nennung im Detail" className="admin-detail-view">
      <EntryDetailPage
        navigation={
          <>
            <AppButton tone="ghost" onClick={onBack}>
              ‹ Nennungen
            </AppButton>
            {navigation}
          </>
        }
        tabs={[
          { key: 'overview', label: 'Übersicht' },
          {
            key: 'documents',
            label: 'Unterlagen',
            count: uploadLines(selected).length,
          },
          {
            key: 'messages',
            label: 'Nachrichten',
            ...(messages.items ? { count: messages.items.length } : {}),
          },
          { key: 'history', label: 'Verlauf' },
        ]}
        activeTab={tab}
        onTab={setTab}
        progress={<EntryAdmissionProgress entry={selected} />}
        sidebar={
          <EntryProperties
            entry={selected}
            busy={api.busy}
            onNumber={() => setNumberOpen((value) => !value)}
            saveNote={(text) =>
              api.performAdminAction({
                kind: 'note',
                visibility: 'internal',
                text,
              })
            }
          />
        }
        header={
          <EntryDetailHeader
            entry={selected}
            actions={
              <>
                <EntryDetailActions
                  selected={selected}
                  workflow={workflow}
                  busy={busy || api.busy}
                  onStatus={(step) => {
                    changeDetailStatus(step);
                  }}
                />
                <Menu label="Weitere Aktionen">
                  <EntryActionRail
                    hidePrimary
                    entry={selected}
                    workflow={workflow}
                    busy={busy || api.busy}
                    onStatus={(step) => {
                      changeDetailStatus(step);
                    }}
                    onVerify={() => setPending({ kind: 'verify' })}
                    onPayment={() => setPending({ kind: 'payment' })}
                    onDimension={(action) =>
                      setPending({ kind: 'dimension', action })
                    }
                    onAdminAction={(action) =>
                      setPending({ kind: 'admin', action })
                    }
                    onPassenger={(action) =>
                      setPending({ kind: 'passenger', action })
                    }
                    onMessage={writeMessage}
                    onRequestDocument={requestDocument}
                  />
                </Menu>
              </>
            }
          />
        }
      >
        <EntryDetailContent
          entry={selected}
          tab={tab}
          numberOpen={numberOpen}
          error={error}
          pending={pending}
          busy={busy}
          api={api}
          documents={documents}
          messages={messages}
          timeline={timeline}
          requestDocument={requestDocument}
          writeMessage={writeMessage}
          onUpdated={onUpdated}
          setNotice={(notice) => notify(notice.message)}
          setPending={setPending}
        />
      </EntryDetailPage>
      <EntryStatusToast notice={notice} clear={() => setNotice(null)} />
      <EntryDetailDialogs
        entry={selected}
        classes={classes}
        pending={pending}
        dialog={dialog}
        busy={busy}
        api={api}
        documents={documents}
        dialogError={dialogError}
        confirm={confirm}
        close={close}
        confirmAdminAction={confirmAdminAction}
        setDialogError={setDialogError}
      />
    </section>
  );
}
