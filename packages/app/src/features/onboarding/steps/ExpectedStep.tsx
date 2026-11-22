import { NumberStepper, OnboardingSwitch, QuestionStep } from '@nennbox/ui';
import { waitlistThreshold } from '@nennbox/contracts';
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
      eyebrow={eyebrow}
      title="Wie viele Starter erwartet ihr?"
      lead="Eine grobe Schätzung reicht. Daraus schlagen wir Plätze und eine Warteliste vor."
      onSubmit={canContinue ? next : undefined}
    >
      <NumberStepper
        label="Erwartete Starter"
        hint="Aus der Vorlage vorgeschlagen, ihr könnt sie verschieben."
        value={answers.expectedStarters ?? resolved.expectedStarters}
        min={10}
        max={400}
        step={5}
        lessLabel="Weniger"
        moreLabel="Mehr"
        onChange={(expectedStarters) => patch({ expectedStarters })}
      />
      <FieldSize starters={resolved.expectedStarters} />
      <p className="nb-onb-capacity">
        NENNBOX plant mit <strong>{proposal.event.capacity} Plätzen</strong>.
      </p>
      <OnboardingSwitch
        label="Warteliste aktivieren"
        hint={`Sind alle Plätze vergeben, tragen sich weitere Fahrer in eine Warteliste ein. Sagt jemand ab, rückt ihr den Nächsten mit einem Klick nach.${resolved.expectedStarters < waitlistThreshold ? ' Bei kleinen Feldern ist das selten nötig.' : ''}`}
        checked={resolved.waitlist}
        onChange={(event) => patch({ waitlist: event.target.checked })}
      />
    </QuestionStep>
  );
}
