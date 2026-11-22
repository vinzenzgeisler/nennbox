import { OnboardingField, QuestionStep } from '@nennbox/ui';
import { checkSubdomain } from '@nennbox/contracts';
import { AppButton } from '@nennbox/ui';
import { sampleTakenSubdomains, type StepProps } from './types.js';

export function ClubStep({
  answers,
  resolved,
  patch,
  next,
  canContinue,
  eyebrow,
}: StepProps) {
  const check = checkSubdomain(resolved.subdomain, sampleTakenSubdomains);
  const messages: Record<string, string> = {
    invalid: 'Nur Kleinbuchstaben, Ziffern und Bindestriche, 3 bis 30 Zeichen.',
    reserved: 'Diese Adresse ist für NENNBOX reserviert.',
    taken: 'Diese Adresse ist schon vergeben.',
  };
  const error =
    resolved.subdomain &&
    check.status !== 'available' &&
    check.status !== 'empty'
      ? messages[check.status]
      : undefined;
  return (
    <QuestionStep
      eyebrow={eyebrow}
      title="Wie heißt euer Verein?"
      lead="Daraus bauen wir die Adresse für euer Nennformular und eure Veranstaltungsseite."
      onSubmit={canContinue ? next : undefined}
    >
      <div className="nb-onb-fields">
        <OnboardingField
          label="Vereinsname"
          value={answers.clubName}
          onChange={(event) => patch({ clubName: event.target.value })}
          autoComplete="organization"
          placeholder="z. B. MSC Hohenstein e. V."
          autoFocus
        />
        <OnboardingField
          label="Adresse"
          value={resolved.subdomain}
          suffix=".nennbox.com"
          onChange={(event) =>
            patch({ subdomain: event.target.value.toLowerCase() || null })
          }
          error={error}
          success={
            check.status === 'available' ? 'Adresse ist frei' : undefined
          }
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
        />
        {check.status === 'taken' && (
          <div>
            <AppButton onClick={() => patch({ subdomain: check.alternative })}>
              {`${check.alternative}.nennbox.com verwenden`}
            </AppButton>
          </div>
        )}
      </div>
    </QuestionStep>
  );
}
