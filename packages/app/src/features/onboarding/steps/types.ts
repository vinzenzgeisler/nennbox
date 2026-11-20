import type {
  EventConfigProposal,
  OnboardingAnswers,
  ResolvedAnswers,
} from '@nennbox/contracts';

export type StepProps = {
  answers: OnboardingAnswers;
  resolved: ResolvedAnswers;
  proposal: EventConfigProposal;
  patch: (value: Partial<OnboardingAnswers>) => void;
  next: () => void;
  canContinue: boolean;
  /** "Schritt 4 von 16 · Veranstaltung" */
  eyebrow: string;
};

export const sampleTakenSubdomains = [
  'msc-beispielstadt',
  'asc-mitte',
  'msc-demo',
  'oldtimerfreunde',
];
