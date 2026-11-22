import {
  createOnboardingAnswers,
  type OnboardingAnswers,
  type OnboardingStepId,
} from '@nennbox/contracts';

/** Every answer owned by a skippable screen, including its follow-up controls. */
const screenFields: Partial<
  Record<OnboardingStepId, readonly (keyof OnboardingAnswers)[]>
> = {
  brand: ['logoName', 'primaryColor', 'accentColor'],
  starters: ['starters'],
  'vehicle-era': ['vehicleEra', 'historicCutoffYear'],
  'vehicle-type': ['vehicleType'],
  languages: ['languages'],
  codriver: ['coDriver'],
  'double-start': ['doubleStart'],
  numbers: ['numberMode'],
  expected: ['expectedStarters', 'waitlist'],
  payment: ['paymentMode', 'stripeTiming'],
  classes: ['classes'],
  terms: ['terms'],
};

/** Null means the domain suggestion, never a second set of UI defaults. */
export function skippedAnswers(
  step: OnboardingStepId,
): Partial<OnboardingAnswers> {
  const empty = createOnboardingAnswers();
  return Object.fromEntries(
    (screenFields[step] ?? []).map((field) => [field, empty[field]]),
  );
}
