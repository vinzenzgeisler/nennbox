import { useState } from 'react';
import {
  AppButton,
  AppCheckbox,
  AppChoiceGroup,
  AppGrid,
  AppSection,
  AppSelect,
  AppTextInput,
  AppEditorRow,
  AppWorkflowPill,
} from '@nennbox/ui';
import { WorkflowRemoveButton } from './WorkflowRemoveButton.js';
import type { Transition, Workflow } from './AdminWorkflow.js';

export function WorkflowTransitionsEditor({
  workflow,
  updateTransition,
  updateWorkflow,
}: {
  workflow: Workflow;
  updateTransition: (index: number, patch: Partial<Transition>) => void;
  updateWorkflow: (workflow: Workflow) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <AppSection
      title="Erlaubte Übergänge"
      description="Bestimme, welche Statusänderungen möglich sind."
    >
      {workflow.transitions.map((edge, index) => (
        <AppEditorRow
          key={index}
          label={'Übergang ' + (index + 1) + ' bearbeiten'}
          preview={
            <>
              <AppWorkflowPill
                label={
                  workflow.statuses.find((status) => status.key === edge.from)
                    ?.labels.de || edge.from
                }
                color={
                  workflow.statuses.find((status) => status.key === edge.from)
                    ?.color
                }
              />
              <span aria-hidden="true">→</span>
              <AppWorkflowPill
                label={
                  workflow.statuses.find((status) => status.key === edge.to)
                    ?.labels.de || edge.to
                }
                color={
                  workflow.statuses.find((status) => status.key === edge.to)
                    ?.color
                }
              />
            </>
          }
          description={[
            edge.reasonRequired && 'Begründung nötig',
            edge.notify && 'Mail',
            ...(edge.roles?.map((role) =>
              role === 'admin' ? 'Veranstaltungsleitung' : 'Teammitglied',
            ) ?? []),
            edge.permission || (!edge.roles?.length && 'Nennung bearbeiten'),
          ]
            .filter(Boolean)
            .join(' · ')}
          open={expanded === index}
          onToggle={() => setExpanded(expanded === index ? null : index)}
        >
          <AppGrid>
            <AppSelect
              label="Von"
              aria-label={'Übergang ' + (index + 1) + ' von'}
              value={edge.from}
              onChange={(event) =>
                updateTransition(index, { from: event.target.value })
              }
            >
              {workflow.statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.labels.de}
                </option>
              ))}
            </AppSelect>
            <AppSelect
              label="Zu"
              aria-label={'Übergang ' + (index + 1) + ' zu'}
              value={edge.to}
              onChange={(event) =>
                updateTransition(index, { to: event.target.value })
              }
            >
              {workflow.statuses.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.labels.de}
                </option>
              ))}
            </AppSelect>
          </AppGrid>
          <AppChoiceGroup label="Optionen">
            <AppCheckbox
              aria-label={
                'Übergang ' + (index + 1) + ' Begründung erforderlich'
              }
              label="Begründung erforderlich"
              checked={edge.reasonRequired}
              onChange={(event) =>
                updateTransition(index, {
                  reasonRequired: event.target.checked,
                })
              }
            />
            <AppCheckbox
              aria-label={'Übergang ' + (index + 1) + ' Fahrer benachrichtigen'}
              label="Teilnehmende per E-Mail benachrichtigen"
              checked={edge.notify ?? false}
              onChange={(event) =>
                updateTransition(index, { notify: event.target.checked })
              }
            />
          </AppChoiceGroup>
          <AppChoiceGroup label="Zulässige Rollen">
            {(['admin', 'member'] as const).map((role) => (
              <AppCheckbox
                key={role}
                aria-label={'Übergang ' + (index + 1) + ' Rolle ' + role}
                label={
                  role === 'admin' ? 'Veranstaltungsleitung' : 'Teammitglied'
                }
                checked={edge.roles?.includes(role) ?? false}
                onChange={(event) => {
                  const roles = new Set(edge.roles ?? []);
                  if (event.target.checked) roles.add(role);
                  else roles.delete(role);
                  updateTransition(index, {
                    roles: roles.size ? [...roles] : undefined,
                  });
                }}
              />
            ))}
          </AppChoiceGroup>
          <p>Ohne Auswahl gilt die Berechtigung „Nennung bearbeiten“.</p>
          <AppTextInput
            label="Technischer Berechtigungsschlüssel (optional)"
            aria-label={'Übergang ' + (index + 1) + ' Berechtigung'}
            value={edge.permission ?? ''}
            onChange={(event) =>
              updateTransition(index, { permission: event.target.value })
            }
            placeholder="entry:write"
          />
          <WorkflowRemoveButton
            confirmation={{
              title: 'Übergang entfernen?',
              message: 'Diese Statusänderung ist danach nicht mehr möglich.',
              reasonLabel: 'Grund',
              cancelLabel: 'Abbrechen',
              confirmLabel: 'Übergang entfernen',
              closeLabel: 'Dialog schließen',
            }}
            onConfirm={() => {
              setExpanded(null);
              updateWorkflow({
                ...workflow,
                transitions: workflow.transitions.filter((_, i) => i !== index),
              });
            }}
          >
            Übergang entfernen
          </WorkflowRemoveButton>
        </AppEditorRow>
      ))}
      <AppButton
        disabled={workflow.statuses.length < 2}
        onClick={() => {
          setExpanded(workflow.transitions.length);
          const from = workflow.statuses[0]?.key;
          const to = workflow.statuses[1]?.key;
          if (from && to)
            updateWorkflow({
              ...workflow,
              transitions: [
                ...workflow.transitions,
                { from, to, reasonRequired: false },
              ],
            });
        }}
      >
        Übergang hinzufügen
      </AppButton>
    </AppSection>
  );
}
