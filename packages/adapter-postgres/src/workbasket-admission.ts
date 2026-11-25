import { evaluateWorkbasket, type RequestContext } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { loadWorkbasketSnapshot } from './workbasket-snapshot.js';
import { createWorkbasketRepository } from './workbasket.js';

export async function assertReadyAdmission(
  tx: TransactionDatabase,
  ctx: RequestContext,
  entryId: string,
  eventId: string,
  workflow?: { statusCategory: string; workflowRevisionId: string },
) {
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
