import type { ReactNode } from 'react';
import {
  ChoiceCard,
  ChoiceGroup,
  OnboardingSketch,
  QuestionStep,
} from '@racepilot/ui';
import { choiceSteps, type ChoiceStep } from '../choices.js';
import { reasonFor } from '../reasons.js';
import type { StepProps } from './types.js';

export type ChoiceStepId = keyof typeof choiceSteps;

/** Setting in the suggested configuration whose explanation belongs to a screen. */
const settingFor: Partial<Record<ChoiceStepId, string[]>> = {
  starters: ['licenseNumber'],
  'vehicle-era': ['vehiclePassNumber'],
  numbers: ['startNumbers'],
  codriver: ['coDriver'],
  'double-start': ['doubleStart'],
  payment: ['payment'],
};
const askedDirectly: ChoiceStepId[] = ['account', 'kind'];

/** Generic single-choice screen: sketch cards, recommended answer, "why" and the follow-up slot. */
export function ChoiceStepView({
  id,
  extra,
  ...step
}: StepProps & { id: ChoiceStepId; extra?: ReactNode }) {
  const config: ChoiceStep = choiceSteps[id];
  const direct = askedDirectly.includes(id);
  const source = (direct ? step.answers : step.resolved) as unknown as Record<
    string,
    unknown
  >;
  const value = source[config.field];
  const current =
    typeof value === 'boolean'
      ? value
        ? 'yes'
        : 'no'
      : (value as string | null);
  const suggested =
    !direct &&
    (step.answers as unknown as Record<string, unknown>)[config.field] === null;
  const why = reasonFor(step.proposal.reasons, ...(settingFor[id] ?? []));
  return (
    <QuestionStep
      eyebrow={`${step.eyebrow} · ${config.topic}`}
      title={config.title}
      lead={config.lead}
      onSubmit={step.canContinue ? step.next : undefined}
      why={
        why
          ? {
              label: suggested ? 'Warum dieser Vorschlag' : 'Das bedeutet',
              text: why,
            }
          : undefined
      }
    >
      <ChoiceGroup layout={config.layout} columns={config.columns}>
        {config.options.map((option) => (
          <ChoiceCard
            key={option.value}
            value={option.value}
            checked={current === option.value}
            onChange={() =>
              step.patch({
                [config.field]: config.boolean
                  ? option.value === 'yes'
                  : option.value,
              })
            }
            title={option.title}
            description={option.description}
            illustration={<OnboardingSketch name={option.sketch} />}
            badge={
              suggested && current === option.value ? 'Empfohlen' : undefined
            }
            exampleLabel="Beispiel"
            example={option.example}
          />
        ))}
      </ChoiceGroup>
      {extra}
    </QuestionStep>
  );
}
