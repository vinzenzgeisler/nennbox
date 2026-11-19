import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { Outcome } from '../AdminEntriesModel.js';
import { EntryRefundDialog } from './EntryRefundDialog.js';

type Invoice = NonNullable<NonNullable<Entry['adminDetails']>['invoice']>;
type RefundPayment = (
  invoiceId: string,
  providerPaymentId: string,
  amountCents: number,
  reason: string,
  idempotencyKey: string,
) => Promise<Outcome>;

export function EntryRefundAction({
  invoice,
  busy,
  error,
  refundPayment,
  onError,
  onClose,
}: {
  invoice: Invoice;
  busy: boolean;
  error: string;
  refundPayment: RefundPayment;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const confirm = (
    paymentId: string,
    cents: number,
    reason: string,
    key: string,
  ) => {
    onError('');
    void refundPayment(invoice.id, paymentId, cents, reason, key).then(
      (result) => (result.ok ? onClose() : onError(result.message)),
    );
  };
  return (
    <EntryRefundDialog
      invoice={invoice}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
