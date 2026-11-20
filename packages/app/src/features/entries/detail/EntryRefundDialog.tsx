import { useState } from 'react';
import { ReasonDialog, SelectField, TextInput } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { formatMoney } from './entryDetailModel.js';
import { parseEuroToCents } from './EntryPaymentDialog.js';

type Invoice = NonNullable<NonNullable<Entry['adminDetails']>['invoice']>;

export function EntryRefundDialog({
  invoice,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  invoice: Invoice;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (
    providerPaymentId: string,
    amountCents: number,
    reason: string,
    idempotencyKey: string,
  ) => void;
  onClose: () => void;
}) {
  const payments = invoice.providerPayments.filter(
    (payment) => payment.refundableCents > 0,
  );
  const [providerPaymentId, setProviderPaymentId] = useState(
    payments[0]?.providerPaymentId ?? '',
  );
  const selected = payments.find(
    (payment) => payment.providerPaymentId === providerPaymentId,
  );
  const [amount, setAmount] = useState(() =>
    ((payments[0]?.refundableCents ?? 0) / 100).toFixed(2).replace('.', ','),
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const cents = parseEuroToCents(amount);
  const valid =
    !!selected && cents !== null && cents <= selected.refundableCents;
  return (
    <ReasonDialog
      open
      title="Stripe-Erstattung"
      message={
        selected
          ? `Noch erstattbar: ${formatMoney(selected.refundableCents, invoice.currency)}. Bereits bezahlt: ${formatMoney(invoice.paidCents, invoice.currency)}.`
          : 'Keine erstattbare Stripe-Zahlung verfügbar.'
      }
      reasonLabel="Grund für die Erstattung (für das Protokoll erforderlich)"
      confirmLabel="Erstattung auslösen"
      cancelLabel="Abbrechen"
      closeLabel="Dialog schließen"
      confirmTone="danger"
      busy={busy}
      error={error}
      confirmDisabled={!valid}
      onConfirm={(reason) =>
        selected &&
        cents !== null &&
        onConfirm(providerPaymentId, cents, reason, idempotencyKey)
      }
      onClose={onClose}
    >
      {payments.length > 1 && (
        <SelectField
          label="Stripe-Zahlung"
          value={providerPaymentId}
          onChange={(event) => {
            const next = payments.find(
              (payment) => payment.providerPaymentId === event.target.value,
            );
            setProviderPaymentId(event.target.value);
            setAmount(
              ((next?.refundableCents ?? 0) / 100).toFixed(2).replace('.', ','),
            );
          }}
        >
          {payments.map((payment) => (
            <option
              key={payment.providerPaymentId}
              value={payment.providerPaymentId}
            >
              {formatMoney(payment.refundableCents, invoice.currency)}
            </option>
          ))}
        </SelectField>
      )}
      <TextInput
        label={`Erstattungsbetrag (${invoice.currency})`}
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        {...(amount && !valid
          ? {
              error:
                'Betrag darf den noch erstattbaren Anteil nicht überschreiten.',
            }
          : {})}
      />
    </ReasonDialog>
  );
}
