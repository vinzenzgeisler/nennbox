import type { EntryResponse as Entry } from '@nennbox/contracts';
import { actorName } from './actorName.js';
import { formatDateTime } from './entryDetailModel.js';

export function EntryRecentNote({ entry }: { entry: Entry }) {
  const latest = (entry.adminHistory ?? [])
    .filter((event) => event.label === 'internal_note' && event.detail.trim())
    .reduce<NonNullable<Entry['adminHistory']>[number] | null>(
      (latest, event) =>
        !latest || event.occurredAt > latest.occurredAt ? event : latest,
      null,
    );
  if (!latest) return null;
  return (
    <section className="nb-entry-recent-note" aria-label="Letzte interne Notiz">
      <h2>Letzte interne Notiz</h2>
      <p>{latest.detail}</p>
      <footer>
        {actorName(latest.actor)} ·{' '}
        <time dateTime={latest.occurredAt}>
          {formatDateTime(latest.occurredAt)}
        </time>
      </footer>
    </section>
  );
}
