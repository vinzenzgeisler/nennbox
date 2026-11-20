import { Radio } from '@nennbox/ui';
import type { RegistrationModel } from './RegistrationModel.js';

const paymentLabels: Record<string, string> = {
  card: 'VISA · MC',
  sepa_debit: 'SEPA',
  paypal: 'PayPal',
  klarna: 'Klarna',
};

export function RegistrationPayment({ model }: { model: RegistrationModel }) {
  const { locale, payload, paymentChoice, setPaymentChoice, estimatedTotal } =
    model;
  const de = locale === 'de';
  const paymentConfig = payload.registrationFormConfig.payments;
  const onlineMethods = payload.onlinePaymentAvailable
    ? paymentConfig.onlineMethods
    : [];
  const bankTransferAvailable =
    paymentConfig.bankTransfer && payload.bankTransferAvailable === true;
  const amount =
    estimatedTotal === null
      ? null
      : new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: payload.currency,
        }).format(estimatedTotal / 100);
  return (
    <section
      className="registration-payment"
      aria-label={de ? 'Zahlung wählen' : 'Choose how to pay'}
    >
      <header className="registration-payment-total">
        <p>{de ? 'Gesamtbetrag' : 'Total due'}</p>
        <strong>
          {amount ?? (de ? 'Wird berechnet' : 'Calculated on submission')}
        </strong>
      </header>
      <div
        className="registration-payment-options"
        role="radiogroup"
        aria-label={de ? 'Zahlungsart' : 'Payment method'}
      >
        {onlineMethods.length > 0 && (
          <Radio
            name="payment-choice"
            value="online"
            checked={paymentChoice === 'online'}
            onChange={() => setPaymentChoice('online')}
            label={de ? 'Jetzt online bezahlen' : 'Pay online now'}
          />
        )}
        {bankTransferAvailable && (
          <Radio
            name="payment-choice"
            value="bank_transfer"
            checked={paymentChoice === 'bank_transfer'}
            onChange={() => setPaymentChoice('bank_transfer')}
            label={de ? 'Per Überweisung' : 'Bank transfer'}
          />
        )}
        <Radio
          name="payment-choice"
          value="later"
          checked={paymentChoice === 'later'}
          onChange={() => setPaymentChoice('later')}
          label={de ? 'Später bezahlen' : 'Pay later'}
        />
      </div>
      {paymentChoice === 'online' && onlineMethods.length > 0 && (
        <p className="registration-payment-methods">
          <span
            className="registration-payment-badges"
            aria-label={
              de ? 'Verfügbare Zahlungsarten' : 'Available payment methods'
            }
          >
            {onlineMethods.map((method) => (
              <span className="registration-payment-badge" key={method}>
                {paymentLabels[method] ?? method}
              </span>
            ))}
          </span>
        </p>
      )}
      {paymentChoice === 'bank_transfer' && (
        <p className="registration-payment-note">
          {de
            ? 'Die Bankverbindung und dein Zahlungszweck erscheinen nach dem Absenden.'
            : 'Bank details and your payment reference will appear after submission.'}
        </p>
      )}
      {paymentChoice === 'later' && (
        <p className="registration-payment-note">
          {de
            ? 'Du kannst die Zahlung später über deine Bestätigung und den Zahlungslink abschließen.'
            : 'You can complete payment later from your confirmation and payment link.'}
        </p>
      )}
    </section>
  );
}
