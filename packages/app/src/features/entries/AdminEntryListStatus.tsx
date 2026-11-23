import { useState } from 'react';
import { Button } from '@nennbox/ui';
import { signIn } from '../../auth.js';
import type { ApiState } from './AdminEntriesModel.js';

export function AdminEntryListStatus({
  apiState,
  total,
  workflowError,
  onRetry,
  onRetryWorkflow,
}: {
  apiState: ApiState;
  total: number;
  workflowError?: ApiState | null | undefined;
  onRetry?: (() => void | Promise<void>) | undefined;
  onRetryWorkflow?: (() => void) | undefined;
}) {
  const [authError, setAuthError] = useState('');
  const reload = () => window.location.reload();
  const errorMessage = (state: ApiState, subject: string) => {
    if (state === 'unauthorized')
      return 'Anmeldung erforderlich. Bitte erneut anmelden.';
    if (state === 'forbidden')
      return `Zugriff verweigert. Dein Konto darf ${subject} nicht ansehen.`;
    return `${subject} konnten nicht geladen werden.`;
  };
  const errorAction = (state: ApiState, retry?: () => void | Promise<void>) =>
    state === 'unauthorized' ? (
      <Button
        variant="secondary"
        onClick={() => {
          setAuthError('');
          void signIn().catch(() =>
            setAuthError(
              'Die Anmeldung konnte nicht gestartet werden. Bitte die Seite neu laden.',
            ),
          );
        }}
      >
        Erneut anmelden
      </Button>
    ) : (
      <Button variant="secondary" onClick={() => void (retry ?? reload)()}>
        Erneut laden
      </Button>
    );
  return (
    <>
      {(apiState === 'ready' || apiState === 'loading') && (
        <p
          aria-live="polite"
          className={apiState === 'ready' ? 'nb-visually-hidden' : undefined}
        >
          {apiState === 'loading'
            ? 'Nennungen werden geladen …'
            : `${total} Nennungen`}
        </p>
      )}
      {apiState !== 'ready' && apiState !== 'loading' && (
        <div>
          <p role="alert">{errorMessage(apiState, 'Nennungen')}</p>
          {errorAction(apiState, onRetry)}
        </div>
      )}
      {workflowError && (
        <div>
          <p role="alert">
            {errorMessage(workflowError, 'Workflow-Einstellungen')}{' '}
            Statusaktionen sind bis zum erfolgreichen Laden nicht verfügbar.
          </p>
          {errorAction(workflowError, onRetryWorkflow)}
        </div>
      )}
      {authError && <p role="alert">{authError}</p>}
    </>
  );
}
