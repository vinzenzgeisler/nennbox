import type { ReactNode } from 'react';
import {
  ChoiceCard,
  ChoiceGroup,
  OnboardingIcon,
  QuestionStep,
} from '@nennbox/ui';
import { resolveAnswers } from '@nennbox/contracts';
import { choiceSteps, type ChoiceStep } from '../choices.js';
import { icons } from '../icons.js';
import type { StepProps } from './types.js';

export type ChoiceStepId = keyof typeof choiceSteps;

const askedDirectly: ChoiceStepId[] = ['account', 'kind'];

const asValue = (value: unknown): string | null =>
  typeof value === 'boolean'
    ? value
      ? 'yes'
      : 'no'
    : (value as string | null);

/** The card a member has chosen, or the suggested one after "Überspringen". */
export function chosenOption(
  id: ChoiceStepId,
  {
    answers,
    resolved,
    accepted,
  }: Pick<StepProps, 'answers' | 'resolved' | 'accepted'>,
): string | null {
  const field = choiceSteps[id].field;
  const given = asValue((answers as unknown as Record<string, unknown>)[field]);
  if (given !== null) return given;
  return accepted && !askedDirectly.includes(id)
    ? asValue((resolved as unknown as Record<string, unknown>)[field])
    : null;
}

/** Generic single-choice screen: cards with their consequence, the recommended answer and an example. */
export function ChoiceStepView({
  id,
  extra,
  ...step
}: StepProps & { id: ChoiceStepId; extra?: ReactNode }) {
  const config: ChoiceStep = choiceSteps[id];
  const direct = askedDirectly.includes(id);
  const current = chosenOption(id, step);
  // What NENNBOX would suggest if the member left this question open.
  const suggested = direct
    ? null
    : asValue(
        (
          resolveAnswers({
            ...step.answers,
            [config.field]: null,
          }) as unknown as Record<string, unknown>
        )[config.field],
      );
  const selected = config.options.find((option) => option.value === current);
  return (
    <QuestionStep
      eyebrow={`${step.eyebrow}`}
      title={config.title}
      lead={config.lead}
      onSubmit={step.canContinue ? step.next : undefined}
      after={extra}
      example={
        selected ? { label: 'Beispiel', text: selected.example } : undefined
      }
      note={
        current === null
          ? direct
            ? 'Wähle eine Karte, damit es weitergeht.'
            : 'Wähle eine Karte, damit es weitergeht. Unser Vorschlag ist mit „Empfohlen“ markiert.'
          : undefined
      }
    >
      <ChoiceGroup columns={config.columns}>
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
            illustration={<OnboardingIcon path={icons[option.icon]} />}
            consequence={
              typeof option.consequence === 'function'
                ? option.consequence(step.resolved)
                : option.consequence
            }
            badge={suggested === option.value ? 'Empfohlen' : undefined}
          />
        ))}
      </ChoiceGroup>
    </QuestionStep>
  );
}
