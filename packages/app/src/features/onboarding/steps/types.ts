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
  /** "Abschnitt 3 · Veranstaltung" */
  eyebrow: string;
  /** The suggestion was accepted with "Überspringen" on this screen. */
  accepted: boolean;
};

export const sampleTakenSubdomains = [
  'msc-beispielstadt',
  'asc-mitte',
  'msc-demo',
  'oldtimerfreunde',
];
