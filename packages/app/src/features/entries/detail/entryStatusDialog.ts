import type { Pending } from './EntryDetailPending.js';
import type { WorkflowView } from '../AdminEntriesModel.js';
export function entryStatusDialog(
  pending: Pending | null,
  workflow: WorkflowView | null,
) {
  return pending?.kind === 'status'
    ? {
        title: pending.step.label.replace(/ …$/, ''),
        message: `Die Nennung wird auf „${workflow?.statuses.find((item) => (item.id ?? item.key) === pending.step.to)?.labels.de ?? pending.step.to}“ gesetzt. Die Entscheidung wird im Verlauf protokolliert.`,
        confirm: 'Status ändern',
        danger: pending.step.danger,
      }
    : pending?.kind === 'verify'
      ? {
          title: 'E-Mail verifizieren',
          message: 'Die E-Mail-Adresse wird als bestätigt markiert.',
          confirm: 'Verifizieren',
        }
      : pending?.kind === 'dimension'
        ? {
            title: pending.action.label,
            message: 'Die Änderung wird im Verlauf protokolliert.',
            confirm: 'Speichern',
          }
        : null;
}
