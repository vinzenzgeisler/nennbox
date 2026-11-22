import { ReasonDialog } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { Pending } from './EntryDetailPending.js';
import type { useEntryDetailApi } from './useEntryDetailApi.js';
import type { useEntryDocumentActions } from '../documents/useEntryDocumentActions.js';
import type { entryStatusDialog } from './entryStatusDialog.js';
import { EntryDocumentRejectDialog } from '../documents/EntryDocumentRejectDialog.js';
import { EntryAdminActionDialog } from './EntryAdminActionDialog.js';
import { EntryPassengerFlow } from './EntryPassengerDialog.js';
import { EntryPaymentDialog } from './EntryPaymentDialog.js';
import { EntryRefundAction } from './EntryRefundAction.js';
export function EntryDetailDialogs({
  entry,
  classes,
  pending,
  dialog,
  busy,
  api,
  documents,
  dialogError,
  confirm,
  close,
  confirmAdminAction,
  setDialogError,
}: {
  entry: Entry;
  classes: Array<{ id: string; name: string; closed?: boolean }>;
  pending: Pending | null;
  dialog: ReturnType<typeof entryStatusDialog>;
  busy: boolean;
  api: ReturnType<typeof useEntryDetailApi>;
  documents: ReturnType<typeof useEntryDocumentActions>;
  dialogError: string;
  confirm: (reason: string, amountCents?: number) => Promise<void>;
  close: () => void;
  confirmAdminAction: (
    action: Parameters<
      ReturnType<typeof useEntryDetailApi>['performAdminAction']
    >[0],
  ) => Promise<void>;
  setDialogError: (message: string) => void;
}) {
  return (
    <>
      {' '}
      {dialog && (
        <ReasonDialog
          open
          title={dialog.title}
          message={dialog.message}
          reasonLabel="Begründung (für das Protokoll erforderlich)"
          confirmLabel={dialog.confirm}
          confirmTone={dialog.danger ? 'danger' : 'default'}
          cancelLabel="Abbrechen"
          closeLabel="Dialog schließen"
          busy={busy || api.busy}
          error={dialogError}
          onConfirm={(reason) => void confirm(reason)}
          onClose={close}
        />
      )}
      <EntryDocumentRejectDialog
        line={documents.rejecting}
        busy={api.busy}
        error={documents.dialogError}
        onConfirm={(reason) => void documents.confirmReject(reason)}
        onClose={documents.cancelReject}
      />
      {pending?.kind === 'admin' && (
        <EntryAdminActionDialog
          kind={pending.action}
          entry={entry}
          classes={classes}
          busy={api.busy}
          error={dialogError}
          onConfirm={(action) => void confirmAdminAction(action)}
          onClose={close}
        />
      )}
      {pending?.kind === 'passenger' && (
        <EntryPassengerFlow
          kind={pending.action}
          entry={entry}
          api={api}
          onClose={close}
        />
      )}
      {pending?.kind === 'payment' && entry.adminDetails!.invoice && (
        <EntryPaymentDialog
          invoice={entry.adminDetails!.invoice}
          busy={api.busy}
          error={dialogError}
          onConfirm={(cents, reason) => void confirm(reason, cents)}
          onClose={close}
        />
      )}
      {pending?.kind === 'refund' && entry.adminDetails!.invoice && (
        <EntryRefundAction
          invoice={entry.adminDetails!.invoice}
          busy={api.busy}
          error={dialogError}
          refundPayment={api.refundPayment}
          onError={setDialogError}
          onClose={close}
        />
      )}
    </>
  );
}
