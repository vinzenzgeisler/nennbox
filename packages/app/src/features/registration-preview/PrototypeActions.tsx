import { RegistrationButton } from '@nennbox/ui';
import { type Step } from './model.js';
import { words, type Locale } from './text.js';

export function LanguageSwitch({
  locale,
  onLocale,
}: {
  locale: Locale;
  onLocale: (locale: Locale) => void;
}) {
  return (
    <div
      className="nb-reg-seg"
      role="group"
      aria-label={locale === 'de' ? 'Sprache' : 'Language'}
    >
      {(['de', 'en'] as const).map((code) => (
        <RegistrationButton
          key={code}
          tone="seg"
          aria-pressed={locale === code}
          onClick={() => onLocale(code)}
        >
          {code.toUpperCase()}
        </RegistrationButton>
      ))}
    </div>
  );
}

/** Back (icon only on phones), the draft note and the one main action of the step. */
export function PrototypeActions({
  locale,
  step,
  first,
  submitStep,
  onBack,
  onNext,
}: {
  locale: Locale;
  step: Step;
  first: boolean;
  submitStep: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  return (
    <>
      {!first && (
        <RegistrationButton
          tone="ghost"
          icon="back"
          iconOnlyOnMobile
          onClick={onBack}
        >
          {w.previous}
        </RegistrationButton>
      )}
      {step === 'person' && (
        <span className="nb-reg-actions-note">
          {t(
            'Dein Entwurf wird beim Weitergehen gespeichert.',
            'Your draft is saved as you continue.',
          )}
        </span>
      )}
      <RegistrationButton tone="primary" icon="next" onClick={onNext}>
        {submitStep
          ? w.submit
          : step === 'payment'
            ? t(
                'Nennung absenden und bezahlen (Simulation)',
                'Submit and pay (simulation)',
              )
            : w.next}
      </RegistrationButton>
    </>
  );
}
