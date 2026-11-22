import {
  onboardingPhaseOf,
  onboardingPhases,
  type OnboardingAnswers,
  type OnboardingPhase,
  type OnboardingStepId,
  onboardingSteps,
} from '@nennbox/contracts';

export const sectionLabels: Record<OnboardingPhase, string> = {
  account: 'Konto',
  club: 'Verein',
  event: 'Veranstaltung',
  participants: 'Teilnehmer',
  entry: 'Nennung',
  publish: 'Veröffentlichen',
  draft: 'Entwurf steht',
};

/** Name of the screen inside its section, as the section bar lists it. */
export const screenLabels: Record<OnboardingStepId, string> = {
  account: 'Anmelden',
  club: 'Name und Adresse',
  brand: 'Logo und Farben',
  kind: 'Was veranstaltet ihr',
  starters: 'Wer startet',
  'vehicle-era': 'Welche Fahrzeuge',
  'vehicle-type': 'Welche Fahrzeuge',
  languages: 'Sprachen',
  codriver: 'Ablauf',
  'double-start': 'Ablauf',
  numbers: 'Startnummern',
  expected: 'Plätze und Bezahlung',
  payment: 'Plätze und Bezahlung',
  classes: 'Klassen und Startgeld',
  form: 'Das Nennformular',
  when: 'Termin und Ort',
  terms: 'Teilnahmebedingungen',
  summary: 'Zusammenfassung',
  success: 'Entwurf steht',
};

/** The six sections shown in the bar; the draft screen has no entry of its own. */
export const barSections = onboardingPhases.filter(
  (phase) => phase !== 'draft',
);

export type BarState = 'done' | 'active' | 'todo';

export function sectionBar(
  current: OnboardingStepId,
  answers: OnboardingAnswers,
) {
  const steps = onboardingSteps(answers);
  const currentPhase = onboardingPhaseOf(current);
  const phaseIndex = onboardingPhases.indexOf(currentPhase);
  return barSections.map((phase, index) => {
    const state: BarState =
      index < phaseIndex ? 'done' : index === phaseIndex ? 'active' : 'todo';
    const labels = [
      ...new Set(
        steps
          .filter((id) => onboardingPhaseOf(id) === phase)
          .map((id) => screenLabels[id]),
      ),
    ];
    const here = labels.indexOf(screenLabels[current]);
    return {
      id: phase,
      label: sectionLabels[phase],
      state,
      firstStep: steps.find((id) => onboardingPhaseOf(id) === phase),
      screens: labels.map((label, position) => ({
        label,
        state: (position < here
          ? 'done'
          : position === here
            ? 'active'
            : 'todo') as BarState,
      })),
    };
  });
}

const words = [
  'eine',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
];
/** "Noch etwa acht Minuten": a rough guess from the screens still ahead (about 45 s each). */
export function remainingTime(
  current: OnboardingStepId,
  answers: OnboardingAnswers,
): string {
  const steps = onboardingSteps(answers);
  const ahead = Math.max(0, steps.length - 2 - steps.indexOf(current));
  const minutes = Math.max(1, Math.round(ahead * 0.75));
  const word = words[minutes - 1] ?? String(minutes);
  return minutes === 1 ? 'Noch etwa eine Minute' : `Noch etwa ${word} Minuten`;
}
