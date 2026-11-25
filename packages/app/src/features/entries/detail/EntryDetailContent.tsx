import { Banner } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { Pending } from './EntryDetailPending.js';
import type { useEntryDetailApi } from './useEntryDetailApi.js';
import type { useEntryDocumentActions } from '../documents/useEntryDocumentActions.js';
import type { useEntryMessages } from './useEntryDetailReads.js';
import type { TimelineItem } from './entryDetailModel.js';
import type { UploadLine } from '../documents/documentLines.js';
import { EntryStartNumber } from './EntryStartNumber.js';
import { EntryDriverSection } from './EntryDriverSection.js';
import { EntryVehicleSection } from './EntryVehicleSection.js';
import { EntryPassengerBlocks } from './EntryPassengerSection.js';
import { EntryCustomAnswers } from './EntryCustomAnswers.js';
import { EntryDocumentsSection } from './EntryDocumentsSection.js';
import { EntryConsentsSection } from './EntryConsentsSection.js';
import { EntryMessagesSection } from './EntryMessagesSection.js';
import { EntryConfirmation } from './EntryConfirmation.js';
import { EntryHistorySection } from './EntryHistorySection.js';
export function EntryDetailContent({
  entry,
  tab,
  numberOpen,
  error,
  pending,
  busy,
  api,
  documents,
  messages,
  timeline,
  requestDocument,
  writeMessage,
  onUpdated,
  setNotice,
  setPending,
}: {
  entry: Entry;
  tab: string;
  numberOpen: boolean;
  error: string;
  pending: Pending | null;
  busy: boolean;
  api: ReturnType<typeof useEntryDetailApi>;
  documents: ReturnType<typeof useEntryDocumentActions>;
  messages: ReturnType<typeof useEntryMessages>;
  timeline: TimelineItem[];
  requestDocument: ((line: UploadLine) => void) | undefined;
  writeMessage: (() => void) | undefined;
  onUpdated: (entry: Entry | null, refresh?: boolean) => void;
  setNotice: (notice: { message: string }) => void;
  setPending: (pending: Pending) => void;
}) {
  return (
    <>
      {error && !pending && <Banner tone="error">{error}</Banner>}
      {documents.error && <Banner tone="error">{documents.error}</Banner>}
      {numberOpen && (
        <EntryStartNumber
          entry={entry}
          onUpdated={(entry) => {
            onUpdated(entry);
            setNotice({ message: 'Startnummer gespeichert' });
          }}
        />
      )}
      {tab === 'overview' && (
        <>
          <div className="nb-entry-overview-columns">
            <EntryDriverSection
              driver={entry.adminDetails!.driver}
              passenger={entry.adminDetails!.passenger ?? null}
              busy={api.busy}
              onSave={api.saveDriver}
            />
            <EntryVehicleSection
              vehicle={entry.adminDetails!.vehicle}
              eventClass={entry.adminDetails!.eventClass}
              busy={api.busy}
              onSave={api.saveVehicle}
            />
          </div>
          <EntryPassengerBlocks details={entry.adminDetails!} />
          <EntryCustomAnswers answers={entry.adminDetails!.customAnswers} />
        </>
      )}
      {tab === 'documents' && (
        <>
          <EntryDocumentsSection
            entry={entry}
            busy={busy || api.busy}
            onReviewDocument={(line) => void documents.review(line)}
            onRejectDocument={documents.startReject}
            onRequestDocument={requestDocument}
            onDimensionAction={(action) =>
              setPending({ kind: 'dimension', action })
            }
            onRecordPayment={() => setPending({ kind: 'payment' })}
            onRefundPayment={() => setPending({ kind: 'refund' })}
            onReconcileRefund={(key, amountCents, currency) =>
              setPending({
                kind: 'reconcile_refund',
                key,
                amountCents,
                currency,
              })
            }
            onAbandonRefund={(key, amountCents, currency) =>
              setPending({ kind: 'abandon_refund', key, amountCents, currency })
            }
          />
          <EntryConsentsSection
            consents={entry.adminDetails!.consents ?? []}
            passengerConsents={entry.adminDetails!.passenger?.consents}
          />
        </>
      )}
      {tab === 'messages' && (
        <>
          <EntryMessagesSection
            messages={messages.items}
            failed={messages.failed}
            onWrite={writeMessage}
          />
        </>
      )}
      {tab === 'documents' && (
        <EntryConfirmation
          eventId={entry.eventId}
          groupId={entry.registrationGroupId}
        />
      )}
      {tab === 'history' && <EntryHistorySection items={timeline} />}
    </>
  );
}
