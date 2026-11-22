import type { RefObject } from 'react';
import type { SetupDraft } from './eventSetupApi.js';
import { deleteRecipient } from './eventRecipientApi.js';
import {
  setupError,
  setupSuccess,
  type SetupMessage,
} from './eventSetupState.js';

export function useRecipientClear(
  lock: RefObject<boolean>,
  loading: RefObject<boolean>,
  setBusy: (busy: boolean) => void,
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void,
  setMessage: (message: SetupMessage) => void,
) {
  const clearRecipient = async () => {
    if (lock.current || loading.current) return;
    setBusy(true);
    try {
      await deleteRecipient();
      setDraft((current) => ({
        ...current,
        accountName: '',
        recipientAddress: '',
        iban: '',
        bic: '',
      }));
      setMessage(setupSuccess('Bankverbindung entfernt.'));
    } catch (error) {
      setMessage(
        setupError(
          error instanceof Error
            ? error.message
            : 'Bankverbindung konnte nicht entfernt werden.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return clearRecipient;
}
