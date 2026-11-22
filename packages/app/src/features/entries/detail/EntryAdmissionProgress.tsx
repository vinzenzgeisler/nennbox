import { AdmissionProgress } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { completionStates } from '../completionStates.js';
export function EntryAdmissionProgress({ entry }: { entry: Entry }) {
  const states = completionStates(entry);
  const documents = entry.documentProjection;
  const missing = documents
    ? Math.max(0, documents.requiredCount - documents.uploadedRequiredCount)
    : 0;
  const labels = ['Startgeld', 'Unterlagen', 'Abnahme', 'Haftverzicht'];
  return (
    <AdmissionProgress
      summary={`${states.filter((state) => state === 'done' || state === 'not_relevant').length} von 4 erledigt${missing ? ` · ${missing} ${missing === 1 ? 'Unterlage fehlt' : 'Unterlagen fehlen'}` : ''}`}
      items={states.map((state, index) => ({
        label: labels[index]!,
        state,
        detail:
          state === 'done'
            ? index === 0
              ? 'bezahlt'
              : 'erledigt'
            : state === 'not_relevant'
              ? 'nicht erforderlich'
              : index === 1
                ? `${missing} fehlen`
                : state === 'wait'
                  ? 'vor Ort'
                  : 'fehlt',
      }))}
    />
  );
}
