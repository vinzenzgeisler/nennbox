import { QuestionStep, Slider, Stack, Switch } from '@nennbox/ui';
import { waitlistThreshold } from '@nennbox/contracts';
import { reasonFor } from '../reasons.js';
import type { StepProps } from './types.js';

/** One square per ten expected starters, a quick feeling for the size of the field. */
const FieldSize = ({ starters }: { starters: number }) => {
  const squares = Math.ceil(starters / 10);
  return (
    <div className="nb-onb-field-size" aria-hidden="true">
      {Array.from({ length: 40 }, (_, index) => (
        <i key={index} className={index < squares ? 'is-filled' : undefined} />
      ))}
    </div>
  );
};

export function ExpectedStep({
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
      eyebrow={`${eyebrow} · Starterfeld`}
      title="Wie viele Starter erwartet ihr?"
      lead="Eine grobe Schätzung reicht. Daraus schlagen wir Plätze und eine Warteliste vor."
      onSubmit={canContinue ? next : undefined}
      why={{
        label: 'Warum dieser Vorschlag',
        text: reasonFor(proposal.reasons, 'capacity', 'waitlist') ?? '',
      }}
    >
      <Stack gap={8}>
        <Slider
          label="Erwartete Starter"
          value={answers.expectedStarters ?? resolved.expectedStarters}
          min={10}
          max={400}
          step={5}
          onChange={(expectedStarters) => patch({ expectedStarters })}
          valueText={`${resolved.expectedStarters} Starter`}
          minLabel="10"
          maxLabel="400"
        />
        <FieldSize starters={resolved.expectedStarters} />
        <p className="nb-onb-capacity">
          NENNBOX plant mit <strong>{proposal.event.capacity} Plätzen</strong>.
        </p>
        <Stack gap={2}>
          <Switch
            label="Warteliste aktivieren"
            checked={resolved.waitlist}
            onChange={(event) => patch({ waitlist: event.target.checked })}
          />
          <p className="nb-onb-note">
            Sind alle Plätze vergeben, tragen sich weitere Fahrer in eine
            Warteliste ein. Sagt jemand ab, rückt ihr den Nächsten mit einem
            Klick nach.
            {resolved.expectedStarters < waitlistThreshold &&
              ' Bei kleinen Feldern ist das selten nötig.'}
          </p>
        </Stack>
      </Stack>
    </QuestionStep>
  );
}
