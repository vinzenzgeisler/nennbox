import {
  Banner,
  Button,
  EmptyState,
  AppNotice,
  AppButton,
  AppEmptyState,
} from '@nennbox/ui';
import type { RemoteErrorKind } from './apiRequest.js';

const EXPLANATION: Record<RemoteErrorKind, string> = {
  unauthorized: 'Bitte melde dich erneut an.',
  forbidden: 'Dein Konto darf das nicht ansehen.',
  'not-found':
    'Dafür gibt es noch keine Daten. Prüfe, ob die Veranstaltung geöffnet ist.',
  unavailable: 'Der Server antwortet gerade nicht.',
};

/** Failure of a loaded view; only a transient failure offers a retry. */
export function RemoteError({
  subject,
  kind,
  onRetry,
  appDesign = false,
}: {
  subject: string;
  kind: RemoteErrorKind;
  onRetry: () => void;
  appDesign?: boolean;
}) {
  if (appDesign)
    return (
      <AppNotice tone="error" title={`${subject} konnte nicht geladen werden.`}>
        <p>{EXPLANATION[kind]}</p>
        {kind === 'unavailable' && (
          <AppButton onClick={onRetry}>Wiederholen</AppButton>
        )}
      </AppNotice>
    );
  return (
    <Banner tone="error" title={`${subject} konnte nicht geladen werden.`}>
      <p>{EXPLANATION[kind]}</p>
      {kind === 'unavailable' && (
        <Button variant="secondary" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </Banner>
  );
}

export function NoEventSelected({
  appDesign = false,
}: {
  appDesign?: boolean;
}) {
  if (appDesign)
    return (
      <AppEmptyState
        title="Keine Veranstaltung gewählt"
        description="Wähle oben links eine Veranstaltung."
      />
    );
  return (
    <EmptyState
      title="Keine Veranstaltung gewählt"
      description="Wähle oben links eine Veranstaltung."
    />
  );
}

export function LoadingNotice({ subject }: { subject: string }) {
  return (
    <p role="status" aria-live="polite">
      {subject} wird geladen …
    </p>
  );
}
