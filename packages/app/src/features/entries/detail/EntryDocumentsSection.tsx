import { useSessionPermission } from '../../shell/SessionPermissions.js';
import {
  Button,
  DetailNote,
  DetailSection,
  DocumentList,
  StatusLabel,
} from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { AdminFileDownload } from '../AdminFileDownload.js';
import { uploadLines, type UploadLine } from '../documents/documentLines.js';
import { uploadRows } from '../documents/uploadRows.js';
import { formatMoney } from './entryDetailModel.js';
import {
  overpaymentText,
  refundIntentText,
  stuckRefundText,
} from './refundIntentText.js';

type Dimension = NonNullable<Entry['statusProjection']>['dimensions'][number];
export type DimensionAction = {
  dimension: 'technical_inspection' | 'waiver';
  status: string;
  label: string;
};

/** Parses the dimension's next action key "waiver:signed" into an executable step. */
export function dimensionAction(item: Dimension): DimensionAction | null {
  const [dimension, status] = item.nextAction?.key.split(':') ?? [];
  return (dimension === 'technical_inspection' || dimension === 'waiver') &&
    status
    ? { dimension, status, label: item.nextAction!.label.de }
    : null;
}

export function EntryDocumentsSection({
  entry,
  busy,
  onDimensionAction,
  onRecordPayment,
  onRefundPayment,
  onAbandonRefund,
  onReconcileRefund,
  onReviewDocument,
  onRejectDocument,
  onRequestDocument,
}: {
  entry: Entry;
  busy: boolean;
  onDimensionAction: (action: DimensionAction) => void;
  onRecordPayment: () => void;
  onRefundPayment: () => void;
  onReconcileRefund?:
    ((key: string, amountCents: number, currency: string) => void) | undefined;
  onAbandonRefund?:
    ((key: string, amountCents: number, currency: string) => void) | undefined;
  onReviewDocument: (line: UploadLine) => void;
  onRejectDocument: (line: UploadLine) => void;
  onRequestDocument?: ((line: UploadLine) => void) | undefined;
}) {
  const canWrite = useSessionPermission('entry:write');
  const canInspect = useSessionPermission('entry:inspect');
  const canPay = useSessionPermission('payment:write');
  const projection = entry.statusProjection?.dimensions ?? [];
  const uploads = (entry.adminDetails?.customAnswers ?? []).filter(
    (answer) => answer.fileDownloadUrl,
  );
  const invoice = entry.adminDetails?.invoice;
  const payment = projection.find((item) => item.key === 'payment');
  const rows = [
    ...uploadRows(entry.id, uploadLines(entry), {
      busy,
      onReview: canWrite ? onReviewDocument : undefined,
      onReject: canWrite ? onRejectDocument : undefined,
      onRequest: canWrite ? onRequestDocument : undefined,
    }),
    ...uploads.map((answer) => ({
      id: `upload-${answer.key}`,
      label: answer.label,
      status: <StatusLabel status="done" label="Vorhanden" />,
      action: <AdminFileDownload url={answer.fileDownloadUrl!} />,
    })),
    ...projection
      .filter(
        (item) => item.key === 'waiver' && item.meaning !== 'not_relevant',
      )
      .map((item) => {
        const action = dimensionAction(item);
        return {
          id: item.key,
          label: 'Haftverzicht Fahrer',
          emphasis: item.meaning === 'missing',
          status: <StatusLabel status={item.meaning} label={item.label.de} />,
          action:
            canInspect && action ? (
              <Button
                variant="text"
                size={32}
                onClick={() => onDimensionAction(action)}
              >
                {action.label}
              </Button>
            ) : undefined,
        };
      }),
    ...(payment && payment.meaning !== 'not_relevant'
      ? [
          {
            id: 'payment',
            label: `Startgeld${
              invoice
                ? ` · ${formatMoney(invoice.totalCents, invoice.currency)}`
                : entry.priceSnapshot
                  ? ` · ${formatMoney(entry.priceSnapshot.totalCents, entry.priceSnapshot.currency)}`
                  : ''
            }`,
            status: (
              <StatusLabel status={payment.meaning} label={payment.label.de} />
            ),
            action:
              canPay &&
              invoice &&
              (invoice.status === 'open' ||
                invoice.status === 'partially_paid') ? (
                <Button variant="text" size={32} onClick={onRecordPayment}>
                  Zahlung erfassen
                </Button>
              ) : undefined,
          },
        ]
      : []),
  ];
  return (
    <DetailSection title="Unterlagen und Zahlung">
      <DocumentList
        items={rows}
        empty={<p>Für diese Nennung sind keine Unterlagen erforderlich.</p>}
      />
      {canPay &&
        invoice?.providerPayments?.some((item) => item.refundableCents > 0) && (
          <Button variant="text" onClick={onRefundPayment}>
            Erstattung auslösen
          </Button>
        )}
      {invoice && overpaymentText(invoice, hasRefundablePayment(invoice)) && (
        <DetailNote>
          {overpaymentText(invoice, hasRefundablePayment(invoice))}
        </DetailNote>
      )}
      {invoice?.refundIntent && (
        <DetailNote>
          {refundIntentText(invoice.refundIntent, invoice.currency)}
        </DetailNote>
      )}
      {invoice?.stuckRefunds?.map((stuck) => (
        <DetailNote key={stuck.key}>
          {stuckRefundText(stuck.amountCents, invoice.currency)}{' '}
          {canPay && onReconcileRefund && (
            <Button
              variant="text"
              size={32}
              onClick={() =>
                onReconcileRefund(
                  stuck.key,
                  stuck.amountCents,
                  invoice.currency,
                )
              }
            >
              Klärung anfordern
            </Button>
          )}
          {canPay && onAbandonRefund && (
            <Button
              variant="text"
              size={32}
              onClick={() =>
                onAbandonRefund(stuck.key, stuck.amountCents, invoice.currency)
              }
            >
              Erstattung abbrechen
            </Button>
          )}
        </DetailNote>
      ))}
      {invoice && invoice.paidCents > 0 && (
        <DetailNote>
          Bezahlt: {formatMoney(invoice.paidCents, invoice.currency)} von{' '}
          {formatMoney(invoice.totalCents, invoice.currency)} · Verwendungszweck{' '}
          {invoice.paymentReference}
        </DetailNote>
      )}
    </DetailSection>
  );
}

const hasRefundablePayment = (
  invoice: NonNullable<NonNullable<Entry['adminDetails']>['invoice']>,
) => invoice.providerPayments.some((item) => item.refundableCents > 0);
