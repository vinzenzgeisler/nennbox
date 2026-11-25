import type { Pending } from './EntryDetailPending.js';
import type { WorkflowView } from '../AdminEntriesModel.js';
import { formatMoney } from '../../../format.js';
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
        : pending?.kind === 'abandon_refund'
          ? {
              title: 'Hängende Erstattung abbrechen',
              message: `Die Erstattung von ${formatMoney(pending.amountCents, pending.currency)} ist bei Stripe nicht ausgeführt worden und wird nicht mehr automatisch wiederholt. Prüfe im Stripe-Dashboard, dass sie dort nicht doch erstattet wurde. Danach ist der Betrag wieder frei, und die Entscheidung wird protokolliert.`,
              confirm: 'Erstattung abbrechen',
              danger: true,
            }
          : null;
}
