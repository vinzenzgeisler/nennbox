import { Button, QuestionStep } from '@racepilot/ui';
import { formatEuro, type OnboardingStepId } from '@racepilot/contracts';
import { choiceSteps } from '../choices.js';
import { formatDay, formatRange } from '../format.js';
import type { StepProps } from './types.js';

const label = (id: keyof typeof choiceSteps, value: string) =>
  choiceSteps[id].options.find((option) => option.value === value)?.title ??
  value;

type Row = { label: string; value: string; step: OnboardingStepId };

export function SummaryStep({
  proposal,
  resolved,
  answers,
  go,
  onDraft,
  next,
  canContinue,
  eyebrow,
}: StepProps & {
  go: (step: OnboardingStepId) => void;
  onDraft: () => void;
}) {
  const { organization, event, classes, payment } = proposal;
  const cheapest = classes.length
    ? Math.min(...classes.map((item) => item.feeCents))
    : 0;
  const rows: Row[] = [
    {
      label: 'Verein',
      value: `${organization.name} · ${organization.subdomain}.nennbox.com`,
      step: 'club',
    },
    {
      label: label('kind', resolved.kind),
      value: event.title,
      step: 'kind',
    },
    {
      label: 'Termin',
      value: formatRange(event.startDate, event.endDate),
      step: 'when',
    },
    { label: 'Ort', value: event.location, step: 'when' },
    {
      label: 'Nennschluss',
      value: formatDay(event.entryDeadline),
      step: 'when',
    },
    {
      label: 'Starter',
      value: label('starters', resolved.starters),
      step: 'starters',
    },
    {
      label: 'Startnummern',
      value: `${label('numbers', resolved.numberMode)}, Bereich ${proposal.startNumbers.range.from}–${proposal.startNumbers.range.to}`,
      step: 'numbers',
    },
    {
      label: 'Klassen',
      value: `${classes.length} Klassen, ab ${formatEuro(cheapest)}`,
      step: 'classes',
    },
    {
      label: 'Plätze',
      value: `${event.capacity}${event.waitlist ? ', mit Warteliste' : ', ohne Warteliste'}`,
      step: 'expected',
    },
    {
      label: 'Zahlung',
      value: [payment.online && 'Online', payment.bankTransfer && 'Überweisung']
        .filter(Boolean)
        .join(' und '),
      step: 'payment',
    },
    {
      label: 'Teilnahmebedingungen',
      value: answers.terms === null ? 'Mustertext' : 'Angepasster Text',
      step: 'terms',
    },
  ];
  return (
    <QuestionStep
      eyebrow={`${eyebrow} · Zusammenfassung`}
      title="Alles bereit zum Öffnen?"
      lead="So sieht eure Nennung aus. Rechts seht ihr die Vorschau. Alles lässt sich später ändern."
      onSubmit={canContinue ? next : undefined}
    >
      <dl className="nb-onb-summary">
        {rows.map((row) => (
          <div key={row.label} className="nb-onb-summary-row">
            <dt>{row.label}</dt>
            <dd>{row.value || '–'}</dd>
            <Button
              variant="text"
              size={40}
              aria-label={`${row.label} ändern`}
              onClick={() => go(row.step)}
            >
              Ändern
            </Button>
          </div>
        ))}
      </dl>
      <div className="nb-onb-draft">
        <Button variant="secondary" size={48} onClick={onDraft}>
          Als Entwurf speichern
        </Button>
        <p className="nb-onb-note">
          Im Entwurf sehen Teilnehmer nichts. Ihr könnt die Nennung jederzeit
          öffnen.
        </p>
      </div>
    </QuestionStep>
  );
}
