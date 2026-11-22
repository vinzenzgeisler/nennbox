import { useId } from 'react';
import {
  AppButton,
  AppEmptyState,
  AppNotice,
  AppSection,
  AppTextInput,
  AppValueRow,
  AppView,
} from '@nennbox/ui';
import { WorkflowStatusesEditor } from './WorkflowStatusesEditor.js';
import { WorkflowTransitionsEditor } from './WorkflowTransitionsEditor.js';
import type { WorkflowEditorProps } from './WorkflowEditorProps.js';

export function WorkflowEditor({
  eventId,
  loading,
  workflow,
  revision,
  updateStatus,
  updateWorkflow,
  updateTransition,
  reason,
  setReason,
  busy,
  save,
  message,
}: WorkflowEditorProps) {
  const reasonHintId = useId();
  if (!eventId) {
    return (
      <AppView>
        <AppEmptyState
          title="Keine Veranstaltung ausgewählt"
          description="Wähle zuerst eine Veranstaltung aus."
        />
      </AppView>
    );
  }
  if (loading) {
    return (
      <AppView>
        <p role="status">Ablauf wird geladen …</p>
      </AppView>
    );
  }
  if (!workflow) {
    return (
      <AppView>
        <AppNotice tone="error">
          Der Nennungsablauf ist ungültig oder konnte nicht geladen werden.
        </AppNotice>
      </AppView>
    );
  }

  return (
    <AppView>
      <AppValueRow label="Aktive Version">
        {revision?.version ?? 'nicht verfügbar'}
      </AppValueRow>

      <WorkflowStatusesEditor
        workflow={workflow}
        updateStatus={updateStatus}
        updateWorkflow={updateWorkflow}
      />
      <WorkflowTransitionsEditor
        workflow={workflow}
        updateTransition={updateTransition}
        updateWorkflow={updateWorkflow}
      />

      <AppSection title="Ablauf aktivieren">
        <AppTextInput
          label="Begründung für die Aktivierung"
          aria-describedby={reasonHintId}
          aria-label="Begründung für die Aktivierung"
          value={reason}
          maxLength={1000}
          onChange={(event) => setReason(event.target.value)}
        />
        <p id={reasonHintId}>
          Die Begründung wird im Änderungsprotokoll gespeichert.
        </p>
        <AppButton
          tone="primary"
          disabled={busy || !reason.trim()}
          onClick={() => void save()}
        >
          Ablauf prüfen und aktivieren
        </AppButton>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </AppSection>
    </AppView>
  );
}
