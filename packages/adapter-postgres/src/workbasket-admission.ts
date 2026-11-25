import { sql } from 'drizzle-orm';
import { evaluateWorkbasket, type RequestContext } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { loadWorkbasketSnapshot } from './workbasket-snapshot.js';
import { createWorkbasketRepository } from './workbasket.js';

/**
 * Conservative write barrier for authoritative workbasket actions. These short,
 * explicit actions must also exclude inserts and direct SQL writers, not just
 * updates of the selected entry. Ordinary advisory reads take no such locks.
 * Lock upgrades are serialized to avoid admission/admission upgrade deadlocks.
 */
export async function assertReadyAdmission(
  tx: TransactionDatabase,
  ctx: RequestContext,
  entryId: string,
  eventId: string,
  workflow?: { statusCategory: string; workflowRevisionId: string },
) {
  await tx.execute(sql`LOCK TABLE organization, event, event_class, entry,
    registration_group, person, vehicle, invoice, invoice_payment,
    entry_document, event_entry_document_type, workbasket_configuration,
    entry_workflow_revision IN SHARE ROW EXCLUSIVE MODE`);
  const database = tx as unknown as Database;
  const config = await createWorkbasketRepository(database).getConfiguration(
    ctx,
    eventId,
  );
  if (!config || workflow?.statusCategory !== 'accepted')
    throw new Error(
      'Nicht mehr bereit zum Zulassen: Veranstaltung oder Ziel ungültig; übersprungen.',
    );
  const snapshot = await loadWorkbasketSnapshot(database, ctx, eventId);
  const tasks = evaluateWorkbasket(snapshot, config.effective);
  if (
    !tasks.some((task) => task.ruleId === 'ready' && task.entryId === entryId)
  ) {
    const entry = snapshot.entries.find((entry) => entry.id === entryId);
    const reasons = !entry
      ? ['Nennung nicht mehr vorhanden']
      : [
          ...(['withdrawn', 'rejected', 'accepted', 'waitlisted'].includes(
            entry.status,
          )
            ? [`Status: ${entry.status}`]
            : []),
          ...(!entry.documentsComplete
            ? ['Unterlagen unvollständig oder abgelehnt']
            : []),
          ...(!entry.paid ? ['Zahlung nicht abgeschlossen'] : []),
          ...tasks
            .filter(
              (task) => task.entryId === entryId && task.severity === 'warning',
            )
            .map((task) => task.reason),
          ...(!config.effective.ready.enabled
            ? ['Bereitschaftsregel deaktiviert']
            : []),
        ];
    throw new Error(
      `Nicht mehr bereit zum Zulassen: ${reasons.join('; ') || 'Auswahl geändert'}; übersprungen.`,
    );
  }
}
