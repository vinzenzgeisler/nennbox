import type { RefObject } from 'react';
import type { SetupDraft } from './eventSetupApi.js';
import { setupSuccess, type SetupMessage } from './eventSetupState.js';

/** Removal is staged locally; saving requires organization-wide confirmation. */
export function useRecipientClear(
  lock: RefObject<boolean>,
  loading: RefObject<boolean>,
  setBusy: (busy: boolean) => void,
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void,
  setMessage: (message: SetupMessage) => void,
) {
  return () => {
    if (lock.current || loading.current) return;
    setDraft((current) => ({ ...current, recipientRemoval: true }));
    setMessage(
      setupSuccess(
        'Entfernen der Bankverbindung vorgemerkt. Erst beim Speichern wird die organisationsweite Löschung bestätigt.',
      ),
    );
  };
}
