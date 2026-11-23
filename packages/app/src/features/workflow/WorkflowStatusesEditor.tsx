import { useState } from 'react';
import {
  AppButton,
  AppGrid,
  AppSection,
  AppSelect,
  AppTextInput,
  AppEditorRow,
  AppWorkflowPill,
} from '@nennbox/ui';
import { WorkflowRemoveButton } from './WorkflowRemoveButton.js';
import type { Status, Workflow } from './AdminWorkflow.js';

const categories = [
  ['pending', 'Offen'],
  ['accepted', 'Zugelassen'],
  ['rejected', 'Abgelehnt'],
  ['waitlisted', 'Warteliste'],
  ['withdrawn', 'Zurückgezogen'],
] as const;

export function WorkflowStatusesEditor({
  workflow,
  updateStatus,
  updateWorkflow,
}: {
  workflow: Workflow;
  updateStatus: (index: number, patch: Partial<Status>) => void;
  updateWorkflow: (workflow: Workflow) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <AppSection
      title="Nennungsstatus"
      description="Lege die sichtbaren Status und ihre Bedeutung fest."
    >
      {workflow.statuses.map((status, index) => (
        <AppEditorRow
          key={status.id ?? status.key}
          label={'Status ' + (index + 1) + ' bearbeiten'}
          preview={
            <AppWorkflowPill
              label={status.labels.de || status.key}
              color={status.color}
            />
          }
          description={[
            status.labels.en,
            categories.find(([value]) => value === status.category)?.[1],
          ]
            .filter(Boolean)
            .join(' · ')}
          open={expanded === index}
          onToggle={() => setExpanded(expanded === index ? null : index)}
        >
          <AppGrid>
            <AppTextInput
              label="Interner Schlüssel"
              aria-label={'Status ' + (index + 1) + ' Schlüssel'}
              value={status.key}
              onChange={(event) =>
                updateStatus(index, { key: event.target.value })
              }
            />
            <AppTextInput
              label="Deutsche Bezeichnung"
              aria-label={'Status ' + (index + 1) + ' Bezeichnung'}
              value={status.labels.de}
              onChange={(event) =>
                updateStatus(index, {
                  labels: { ...status.labels, de: event.target.value },
                })
              }
            />
            <AppTextInput
              label="Englische Bezeichnung"
              aria-label={'Status ' + (index + 1) + ' englische Bezeichnung'}
              value={status.labels.en}
              onChange={(event) =>
                updateStatus(index, {
                  labels: { ...status.labels, en: event.target.value },
                })
              }
            />
            <AppTextInput
              label="Statusfarbe"
              aria-label={'Status ' + (index + 1) + ' Farbe'}
              type="color"
              value={
                /^#[0-9a-f]{6}$/i.test(status.color) ? status.color : '#000000'
              }
              onChange={(event) =>
                updateStatus(index, { color: event.target.value })
              }
            />
            <AppSelect
              label="Bedeutung"
              aria-label={'Status ' + (index + 1) + ' Bedeutung'}
              value={status.category}
              onChange={(event) =>
                updateStatus(index, { category: event.target.value })
              }
            >
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </AppSelect>
          </AppGrid>
          <WorkflowRemoveButton
            confirmation={{
              title: 'Status entfernen?',
              message:
                'Der Status und alle zugehörigen Übergänge werden entfernt.',
              reasonLabel: 'Grund',
              cancelLabel: 'Abbrechen',
              confirmLabel: 'Status entfernen',
              closeLabel: 'Dialog schließen',
            }}
            onConfirm={() => {
              setExpanded(null);
              updateWorkflow({
                ...workflow,
                statuses: workflow.statuses.filter((_, i) => i !== index),
                transitions: workflow.transitions.filter(
                  (edge) =>
                    edge.from !== (status.id ?? status.key) &&
                    edge.to !== (status.id ?? status.key),
                ),
              });
            }}
          >
            Status entfernen
          </WorkflowRemoveButton>
        </AppEditorRow>
      ))}
      <AppButton
        onClick={() => {
          setExpanded(workflow.statuses.length);
          updateWorkflow({
            ...workflow,
            statuses: [
              ...workflow.statuses,
              {
                id: 'status_' + crypto.randomUUID(),
                key: 'status_' + (workflow.statuses.length + 1),
                labels: { en: 'New status', de: 'Neuer Status' },
                color: '#64748b',
                category: 'pending',
              },
            ],
          });
        }}
      >
        Status hinzufügen
      </AppButton>
    </AppSection>
  );
}
