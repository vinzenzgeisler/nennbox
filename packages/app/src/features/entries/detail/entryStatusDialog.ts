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
        : pending?.kind === 'reconcile_refund'
          ? {
              title: 'Erstattung klären',
              message:
                'Der ursprüngliche Vorgang wird erneut bei Stripe abgeglichen. Der Betrag bleibt bis zur Bestätigung reserviert. Bitte gib den Anlass und das Ergebnis deiner bisherigen Prüfung an; die Anfrage wird protokolliert.',
              confirm: 'Klärung anfordern',
            }
          : pending?.kind === 'abandon_refund'
            ? {
                title: 'Hängende Erstattung abbrechen',
                message: `Die Erstattung von ${formatMoney(pending.amountCents, pending.currency)} darf nur nach sicherer Bestätigung abgebrochen werden, dass Stripe nichts erstattet hat und kein Auftrag mehr läuft. Ist der Ausgang unklar, fordere stattdessen eine Klärung an. Unklare Vorgänge bleiben gesperrt; ein Abbruch wird protokolliert.`,
                confirm: 'Erstattung abbrechen',
                danger: true,
              }
            : null;
}
