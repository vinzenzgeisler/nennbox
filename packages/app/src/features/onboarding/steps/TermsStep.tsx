import { Button, QuestionStep, Stack, Textarea } from '@nennbox/ui';
import { reasonFor } from '../reasons.js';
import type { StepProps } from './types.js';

export function TermsStep({
  answers,
  resolved,
  proposal,
  patch,
  next,
  canContinue,
  eyebrow,
}: StepProps) {
  return (
    <QuestionStep
      eyebrow={`${eyebrow} · Teilnahmebedingungen`}
      title="Das gilt für eure Teilnehmer"
      onSubmit={canContinue ? next : undefined}
      lead="Teilnehmer bestätigen diese Bedingungen mit ihrer Nennung. Passt den Mustertext an oder übernehmt ihn."
      why={{
        label: answers.terms === null ? 'Warum dieser Vorschlag' : 'Angepasst',
        text:
          reasonFor(proposal.reasons, 'terms') ??
          'Ihr habt den Text angepasst. Wir empfehlen, ihn rechtlich prüfen zu lassen.',
      }}
    >
      <Stack gap={4}>
        <Textarea
          label="Teilnahmebedingungen"
          value={resolved.terms}
          rows={10}
          onChange={(event) => patch({ terms: event.target.value })}
          error={
            resolved.terms.trim()
              ? undefined
              : 'Bitte Teilnahmebedingungen eintragen.'
          }
        />
        <div>
          <Button
            variant="text"
            size={40}
            disabled={answers.terms === null}
            onClick={() => patch({ terms: null })}
          >
            Mustertext wiederherstellen
          </Button>
        </div>
      </Stack>
    </QuestionStep>
  );
}
