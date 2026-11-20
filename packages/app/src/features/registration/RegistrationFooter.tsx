import { Button } from '@nennbox/ui';
import type { RegistrationActions } from './RegistrationActions.js';
import type { RegistrationModel } from './RegistrationModel.js';

export function RegistrationFooter({
  model,
  actions,
}: {
  model: RegistrationModel;
  actions: RegistrationActions;
}) {
  const {
    locale,
    step,
    steps,
    submitting,
    savingDraft,
    setStep,
    t,
    paymentStepEnabled,
    paymentChoice,
    estimatedTotal,
    payload,
  } = model;
  const total =
    estimatedTotal === null
      ? ''
      : new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: payload.currency,
        }).format(estimatedTotal / 100);
  const reviewStep = paymentStepEnabled ? steps.length - 2 : steps.length - 1;
  const { saveDraft } = actions;
  return (
    <div className="registration-footer">
      <div className="registration-actions">
        {step > 0 && (
          <Button
            type="button"
            variant="text"
            onClick={() => setStep(step - 1)}
          >
            ← {t.previous}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={savingDraft}
          onClick={() => void saveDraft()}
        >
          {savingDraft
            ? t.sending
            : locale === 'de'
              ? 'Zwischenspeichern'
              : 'Save for later'}
        </Button>
        <Button type="submit" form="registration-form" disabled={submitting}>
          {submitting
            ? t.sending
            : step === steps.length - 1
              ? paymentChoice === 'online'
                ? locale === 'de'
                  ? `Jetzt bezahlen · ${total}`
                  : `Pay now · ${total}`
                : t.submit
              : step === reviewStep
                ? locale === 'de'
                  ? 'Weiter zur Zahlung'
                  : 'Continue to payment'
                : step === reviewStep - 1
                  ? locale === 'de'
                    ? 'Weiter zur Prüfung'
                    : 'Continue to review'
                  : locale === 'de'
                    ? 'Weiter zu Startmeldungen'
                    : 'Continue to entries'}
        </Button>
      </div>
    </div>
  );
}
