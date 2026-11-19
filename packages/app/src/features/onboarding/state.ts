import { useCallback, useEffect, useReducer } from 'react';
import {
  createOnboardingAnswers,
  nextOnboardingStep,
  previousOnboardingStep,
  type OnboardingAnswers,
  type OnboardingStepId,
} from '@racepilot/contracts';

export type Outcome = 'open' | 'draft';
export type OnboardingState = {
  step: OnboardingStepId;
  answers: OnboardingAnswers;
  outcome: Outcome | null;
  savedAt: number | null;
};

type Action =
  | { type: 'patch'; patch: Partial<OnboardingAnswers> }
  | { type: 'go'; step: OnboardingStepId }
  | { type: 'publish'; outcome: Outcome }
  | { type: 'reset' };

export const storageKey = 'nennbox.onboarding-preview.v1';
const initial = (): OnboardingState => ({
  step: 'account',
  answers: createOnboardingAnswers(),
  outcome: null,
  savedAt: null,
});

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'patch': {
      const patch = { ...action.patch };
      // A different event type brings different classes and terms.
      if (patch.kind && patch.kind !== state.answers.kind) {
        patch.classes = null;
        patch.terms = null;
      }
      return {
        ...state,
        answers: { ...state.answers, ...patch },
        savedAt: Date.now(),
      };
    }
    case 'go':
      return { ...state, step: action.step };
    case 'publish':
      return { ...state, step: 'success', outcome: action.outcome };
    case 'reset':
      return initial();
  }
}

function load(): OnboardingState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return initial();
    const stored = JSON.parse(raw) as OnboardingState;
    return {
      ...initial(),
      ...stored,
      answers: { ...createOnboardingAnswers(), ...stored.answers },
    };
  } catch {
    return initial();
  }
}

/** Local, automatically saved state of the prototype; the connected flow replaces the storage. */
export function useOnboardingState() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* private mode: the draft simply stays in memory */
    }
  }, [state]);
  const patch = useCallback(
    (value: Partial<OnboardingAnswers>) =>
      dispatch({ type: 'patch', patch: value }),
    [],
  );
  const go = useCallback(
    (step: OnboardingStepId) => dispatch({ type: 'go', step }),
    [],
  );
  const next = useCallback(() => {
    const target = nextOnboardingStep(state.step, state.answers);
    if (target) dispatch({ type: 'go', step: target });
  }, [state.step, state.answers]);
  const back = useCallback(() => {
    const target = previousOnboardingStep(state.step, state.answers);
    if (target) dispatch({ type: 'go', step: target });
  }, [state.step, state.answers]);
  const publish = useCallback(
    (outcome: Outcome) => dispatch({ type: 'publish', outcome }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  return { state, patch, go, next, back, publish, reset };
}
