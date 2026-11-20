/**
 * Pure onboarding proposal API for the connected setup flow in phase 2.
 * The implementation and types live in contracts so the prototype app can
 * consume the same model without crossing the frontend -> core boundary.
 */
export {
  canContinue,
  createOnboardingAnswers,
  nextOnboardingStep,
  onboardingProgress,
  onboardingSteps,
  previousOnboardingStep,
  resolveAnswers,
  suggestEventConfig,
} from '@nennbox/contracts';
export type {
  EventConfigProposal,
  OnboardingAnswers,
  OnboardingStepId,
  ResolvedAnswers,
} from '@nennbox/contracts';
