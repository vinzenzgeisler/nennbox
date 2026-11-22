import { AppButton, OnboardingTextarea, QuestionStep } from '@nennbox/ui';
import type { StepProps } from './types.js';

export function TermsStep({
  answers,
  resolved,
  patch,
  next,
  canContinue,
  eyebrow,
}: StepProps) {
  return (
    <QuestionStep
      eyebrow={eyebrow}
      title="Das gilt für eure Teilnehmer"
      lead="Teilnehmer bestätigen diese Bedingungen mit ihrer Nennung. Passt den Mustertext an oder übernehmt ihn."
      onSubmit={canContinue ? next : undefined}
    >
      <OnboardingTextarea
        label="Teilnahmebedingungen"
        value={resolved.terms}
        rows={10}
        onChange={(event) => patch({ terms: event.target.value })}
        hint={
          answers.terms === null
            ? 'Mustertext für diesen Veranstaltungstyp. Er ersetzt keine rechtliche Prüfung, bitte vor der Veröffentlichung lesen.'
            : 'Angepasst. Wir empfehlen, den Text rechtlich prüfen zu lassen.'
        }
        error={
          resolved.terms.trim()
            ? undefined
            : 'Bitte Teilnahmebedingungen eintragen.'
        }
      />
      <div>
        <AppButton
          disabled={answers.terms === null}
          onClick={() => patch({ terms: null })}
        >
          Mustertext wiederherstellen
        </AppButton>
      </div>
    </QuestionStep>
  );
}
