import { Button } from '@nennbox/ui';
import type { RegistrationModel } from './RegistrationModel.js';
import type { RegistrationActions } from './RegistrationActions.js';

export function RegistrationConfirmation({
  model,
  actions,
  eventSlug,
}: {
  model: RegistrationModel;
  actions: RegistrationActions;
  eventSlug: string;
}) {
  const { payload, t, locale, paymentInstructions } = model;
  return (
    <section aria-labelledby="registration-success">
      <h2 id="registration-success">{payload.event.name}</h2>
      <p role="status">{t.submitted}</p>
      {model.submissionResult?.entries && (
        <ul aria-label={locale === 'de' ? 'Startmeldungen' : 'Entries'}>
          {model.submissionResult.entries.map((entry, index) => (
            <li key={entry.entryId}>
              {index + 1}:{' '}
              {entry.status === 'waitlisted'
                ? locale === 'de'
                  ? `Auf der Warteliste, Platz ${entry.waitlistPosition}`
                  : `On the waiting list, position ${entry.waitlistPosition}`
                : locale === 'de'
                  ? 'Nennung eingegangen'
                  : 'Registration received'}
            </li>
          ))}
        </ul>
      )}
      {model.paymentError && (
        <div role="alert">
          <p>
            {locale === 'de'
              ? 'Zahlung nicht gestartet'
              : 'Payment not started'}
          </p>
          <Button
            type="button"
            disabled={model.submitting}
            onClick={() => void actions.retryPayment()}
          >
            {locale === 'de' ? 'Erneut versuchen' : 'Try again'}
          </Button>
        </div>
      )}
      {paymentInstructions && (
        <section
          className="registration-payment-instructions"
          aria-label={
            locale === 'de' ? 'Überweisungsdaten' : 'Bank transfer details'
          }
        >
          <h3>{locale === 'de' ? 'Überweisung' : 'Bank transfer'}</h3>
          <dl>
            <dt>{locale === 'de' ? 'Empfänger' : 'Recipient'}</dt>
            <dd>{paymentInstructions.accountName}</dd>
            <dt>IBAN</dt>
            <dd>{paymentInstructions.iban}</dd>
            {paymentInstructions.bic && (
              <>
                <dt>BIC</dt>
                <dd>{paymentInstructions.bic}</dd>
              </>
            )}
            <dt>{locale === 'de' ? 'Betrag' : 'Amount'}</dt>
            <dd>
              {new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: paymentInstructions.currency,
              }).format(paymentInstructions.amountCents / 100)}
            </dd>
            <dt>
              {locale === 'de' ? 'Verwendungszweck' : 'Payment reference'}
            </dt>
            <dd>{paymentInstructions.paymentReference}</dd>
          </dl>
        </section>
      )}
      <p>
        {locale === 'de'
          ? 'Nach Bestätigung deiner E-Mail kannst du deine Nennung jederzeit einsehen.'
          : 'After verifying your email, you can view your entry at any time.'}
      </p>
      <a href={`/events/${encodeURIComponent(eventSlug)}/my-entry`}>
        {locale === 'de' ? 'Meine Nennung' : 'My entry'}
      </a>
    </section>
  );
}
