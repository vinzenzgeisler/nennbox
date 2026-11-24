import { Button } from '@nennbox/ui';
import { formatMoney } from '../../format.js';
import type { View } from './driverPortalTypes.js';

type Payment = NonNullable<View['payment']>;

/** Payment state of the driver: pay now or later, resume or cancel an open online payment, bank details. */
export function DriverPortalPayment({
  payment,
  working,
  pay,
  cancelPayment,
}: {
  payment: Payment;
  working: boolean;
  pay: () => Promise<void>;
  cancelPayment: () => Promise<void>;
}) {
  const open = payment.totalCents - payment.paidCents;
  return (
    <section className="driver-portal-panel">
      <p className="driver-portal-eyebrow">ZAHLUNG</p>
      <h2>
        {payment.status === 'paid'
          ? 'Bezahlt'
          : payment.status === 'partially_paid'
            ? 'Teilweise bezahlt'
            : 'Noch offen'}
      </h2>
      <p className="driver-portal-amount">
        {formatMoney(payment.totalCents, payment.currency)}
      </p>
      {payment.paidCents > 0 && payment.status !== 'paid' && (
        <p>Noch offen: {formatMoney(open, payment.currency)}</p>
      )}
      {payment.onlinePayable && (
        <>
          {payment.checkoutPending && (
            <p>
              Eine Online-Zahlung wurde begonnen, aber noch nicht abgeschlossen.
              Du kannst sie fortsetzen oder abbrechen und später bezahlen.
            </p>
          )}
          <Button disabled={working} onClick={() => void pay()}>
            {payment.checkoutPending
              ? 'Zahlung fortsetzen'
              : 'Jetzt online bezahlen'}
          </Button>
          {payment.checkoutPending && (
            <Button
              variant="text"
              disabled={working}
              onClick={() => void cancelPayment()}
            >
              Zahlung abbrechen
            </Button>
          )}
        </>
      )}
      <dl>
        <dt>Verwendungszweck</dt>
        <dd>{payment.paymentReference}</dd>
        {payment.accountName && (
          <>
            <dt>Empfänger</dt>
            <dd>{payment.accountName}</dd>
          </>
        )}
        {payment.iban && (
          <>
            <dt>IBAN</dt>
            <dd>{payment.iban}</dd>
          </>
        )}
        {payment.bic && (
          <>
            <dt>BIC</dt>
            <dd>{payment.bic}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
