import type { EventOption, SetupDraft } from './eventSetupApi.js';

const emptyDraft = (): SetupDraft => ({
  name: '',
  slug: '',
  startsOn: '',
  endsOn: '',
  classes: [{ name: '', code: '', fee: '', vehicleType: 'car' }],
  terms: '',
  organizerName: '',
  organizerAddress: '',
  arrivalNotes: '',
  paddockNotes: '',
  accountName: '',
  recipientAddress: '',
  iban: '',
  bic: '',
});

/** A notice shown below the setup form; errors are announced as alerts. */
export type SetupMessage = {
  tone: 'error' | 'success' | 'info';
  text: string;
} | null;
export const setupError = (text: string): SetupMessage => ({
  tone: 'error',
  text,
});
export const setupSuccess = (text: string): SetupMessage => ({
  tone: 'success',
  text,
});

export const savedMessage = (open: boolean): SetupMessage =>
  setupSuccess(
    open
      ? 'Veranstaltung gespeichert und Nennung geöffnet.'
      : 'Entwurf gespeichert. Du kannst ihn jederzeit fortsetzen.',
  );

export type EventSetupState = {
  draft: SetupDraft;
  events: EventOption[];
  busy: boolean;
  message: SetupMessage;
  link: string;
  currentStep: number;
};

type EventSetupAction =
  | {
      type: 'draft';
      update: SetupDraft | ((current: SetupDraft) => SetupDraft);
    }
  | { type: 'events'; events: EventOption[] }
  | { type: 'busy'; busy: boolean }
  | { type: 'message'; message: SetupMessage }
  | { type: 'link'; link: string }
  | { type: 'step'; step: number }
  | { type: 'reset' };

export const initialState = (): EventSetupState => ({
  draft: emptyDraft(),
  events: [],
  busy: false,
  message: null,
  link: '',
  currentStep: 0,
});

export function reduceEventSetup(
  state: EventSetupState,
  action: EventSetupAction,
): EventSetupState {
  switch (action.type) {
    case 'draft':
      return {
        ...state,
        draft:
          typeof action.update === 'function'
            ? action.update(state.draft)
            : action.update,
      };
    case 'events':
      return { ...state, events: action.events };
    case 'busy':
      return { ...state, busy: action.busy };
    case 'message':
      return { ...state, message: action.message };
    case 'link':
      return { ...state, link: action.link };
    case 'step':
      return { ...state, currentStep: action.step };
    case 'reset':
      return { ...initialState(), events: state.events };
  }
}
