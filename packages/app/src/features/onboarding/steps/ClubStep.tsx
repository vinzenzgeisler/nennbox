import {
  Button,
  QuestionStep,
  Stack,
  StatusLabel,
  TextInput,
} from '@racepilot/ui';
import { checkSubdomain } from '@racepilot/contracts';
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
  const host = `${resolved.subdomain || 'verein'}.nennbox.com`;
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
      eyebrow={`${eyebrow} · Verein`}
      title="Wie heißt euer Verein?"
      lead="Daraus bauen wir die Adresse für euer Nennformular und eure Veranstaltungsseite."
      onSubmit={canContinue ? next : undefined}
    >
      <Stack gap={6} className="nb-onb-fields">
        <TextInput
          label="Vereinsname"
          value={answers.clubName}
          onChange={(event) => patch({ clubName: event.target.value })}
          autoComplete="organization"
          placeholder="z. B. MSC Hohenstein e. V."
          autoFocus
        />
        <div>
          <TextInput
            label="Adresse"
            value={resolved.subdomain}
            onChange={(event) =>
              patch({ subdomain: event.target.value.toLowerCase() || null })
            }
            error={error}
            hint={`https://${host}`}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
        </div>
        {check.status === 'available' && (
          <StatusLabel status="done" label="Adresse ist frei" />
        )}
        {check.status === 'taken' && (
          <Button
            variant="secondary"
            size={40}
            onClick={() => patch({ subdomain: check.alternative })}
          >
            {`${check.alternative}.nennbox.com verwenden`}
          </Button>
        )}
      </Stack>
    </QuestionStep>
  );
}
