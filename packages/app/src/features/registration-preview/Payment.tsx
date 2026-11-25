import { RegistrationNotice, RegistrationOptionCard } from '@nennbox/ui';
import { payableNow, type PreviewConfig } from './model.js';
import { type FormProps } from './PersonFields.js';
import { money } from './text.js';

export function Payment({
  draft,
  locale,
  onDraft,
  config,
}: FormProps & { config: PreviewConfig }) {
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  const methods = {
    online: [
      t('Jetzt online bezahlen', 'Pay online'),
      t('Karte, Apple Pay oder SEPA', 'Card, Apple Pay or SEPA'),
    ],
    transfer: [
      t('Überweisung', 'Bank transfer'),
      t(
        'Du bekommst die Bankverbindung nach dem Absenden.',
        'You receive the bank details after submitting.',
      ),
    ],
  } as const;
  return (
    <>
      <p className="nb-reg-lead">
        {t(
          'Der Verein verlangt das Startgeld sofort. Deine Nennung gilt erst als eingegangen, wenn bezahlt ist.',
          'The organiser requires immediate payment. Your registration is received once payment is complete.',
        )}
      </p>
      <RegistrationNotice>
        {t(
          'Prototyp: keine Zahlung und keine Übermittlung. Der nächste Klick simuliert die Rückkehr.',
          'Prototype: no payment or submission. The next click simulates the return.',
        )}
      </RegistrationNotice>
      <fieldset id="paymentMethod" tabIndex={-1}>
        <legend>{t('Zahlungsart', 'Payment method')}</legend>
        <div className="nb-reg-options">
          {(['online', 'transfer'] as const).map((method) => (
            <RegistrationOptionCard
              key={method}
              name="payment"
              label={methods[method][0]}
              detail={methods[method][1]}
              checked={draft.paymentMethod === method}
              onChange={() => onDraft({ ...draft, paymentMethod: method })}
            />
          ))}
        </div>
      </fieldset>
      <div className="nb-reg-cost-row is-total">
        <span>{t('Gesamtbetrag', 'Total')}</span>
        <strong>{money(payableNow(draft, config), locale)}</strong>
      </div>
    </>
  );
}
