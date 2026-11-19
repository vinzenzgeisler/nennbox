import { checkSubdomain, isIsoDay } from './helpers.js';
import { resolveAnswers } from './answers.js';
import { onboardingPhases } from './types.js';
import type {
  OnboardingAnswers,
  OnboardingPhase,
  OnboardingStepId,
} from './types.js';

const phaseOfStep: Record<OnboardingStepId, OnboardingPhase> = {
  account: 'account',
  club: 'club',
  brand: 'club',
  kind: 'kind',
  starters: 'details',
  'vehicle-era': 'details',
  'vehicle-type': 'details',
  expected: 'details',
  numbers: 'details',
  codriver: 'details',
  'double-start': 'details',
  payment: 'details',
  classes: 'classes',
  when: 'when',
  terms: 'when',
  summary: 'done',
  success: 'done',
};
export const onboardingPhaseOf = (step: OnboardingStepId) => phaseOfStep[step];

/** Screens that cannot be skipped because no sensible suggestion exists. */
export const requiredSteps: readonly OnboardingStepId[] = [
  'account',
  'club',
  'kind',
  'when',
  'summary',
];

/**
 * The screens this member sees, in order. Follow-up questions appear only when the
 * answers so far make them meaningful: karts have no vehicle history, rallies are
 * always driven in pairs on one vehicle type, and so on.
 */
export function onboardingSteps(
  answers: OnboardingAnswers,
): OnboardingStepId[] {
  const kind = answers.kind;
  const steps: OnboardingStepId[] = ['account', 'club', 'brand', 'kind'];
  steps.push('starters');
  if (kind !== 'kart') steps.push('vehicle-era');
  if (kind !== 'kart' && kind !== 'rally') steps.push('vehicle-type');
  steps.push('expected', 'numbers');
  if (kind === 'rally' || kind === 'regularity' || kind === 'other')
    steps.push('codriver');
  if (kind !== 'rally' && kind !== 'regularity') steps.push('double-start');
  steps.push('payment', 'classes', 'when', 'terms', 'summary', 'success');
  return steps;
}

export function nextOnboardingStep(
  current: OnboardingStepId,
  answers: OnboardingAnswers,
): OnboardingStepId | null {
  const steps = onboardingSteps(answers);
  return steps[steps.indexOf(current) + 1] ?? null;
}
export function previousOnboardingStep(
  current: OnboardingStepId,
  answers: OnboardingAnswers,
): OnboardingStepId | null {
  const steps = onboardingSteps(answers);
  const index = steps.indexOf(current);
  return index > 0 ? (steps[index - 1] ?? null) : null;
}

export interface OnboardingProgress {
  /** Zero-based position among the screens the member will see. */
  index: number;
  total: number;
  phase: OnboardingPhase;
  phaseIndex: number;
  /** 0–1 share of the screens before the final summary and success screens. */
  ratio: number;
}

export function onboardingProgress(
  current: OnboardingStepId,
  answers: OnboardingAnswers,
): OnboardingProgress {
  const steps = onboardingSteps(answers);
  const index = Math.max(0, steps.indexOf(current));
  return {
    index,
    total: steps.length,
    phase: phaseOfStep[current],
    phaseIndex: onboardingPhases.indexOf(phaseOfStep[current]),
    ratio: Math.min(1, index / (steps.length - 2)),
  };
}

/** Whether "Weiter" is possible; skippable screens always are, because a suggestion exists. */
export function canContinue(
  step: OnboardingStepId,
  answers: OnboardingAnswers,
  takenSubdomains: readonly string[] = [],
): boolean {
  const resolved = resolveAnswers(answers);
  switch (step) {
    case 'account':
      return answers.authMethod !== null;
    case 'club':
      return (
        resolved.clubName.length > 1 &&
        checkSubdomain(resolved.subdomain, takenSubdomains).status ===
          'available'
      );
    case 'kind':
      return answers.kind !== null;
    case 'classes': {
      const names = resolved.classes.map((item) => item.name.trim());
      return (
        names.length > 0 &&
        names.every(Boolean) &&
        new Set(names.map((name) => name.toLowerCase())).size === names.length
      );
    }
    case 'when':
      return (
        resolved.startDate !== null &&
        resolved.location.length > 0 &&
        (resolved.endDate === null || resolved.endDate >= resolved.startDate) &&
        (resolved.entryDeadline === null ||
          !isIsoDay(resolved.entryDeadline) ||
          resolved.entryDeadline <= resolved.startDate)
      );
    case 'terms':
      return resolved.terms.trim().length > 0;
    default:
      return true;
  }
}
