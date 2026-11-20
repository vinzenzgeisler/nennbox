import { DetailSection, FieldGrid, FieldItem } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';

type Answer = NonNullable<Entry['adminDetails']>['customAnswers'][number];

/** Answers to the event's own registration questions; uploads are listed under the documents. */
export function EntryCustomAnswers({ answers }: { answers: Answer[] }) {
  const typed = answers.filter((answer) => !answer.fileDownloadUrl);
  if (!typed.length) return null;
  return (
    <DetailSection title="Weitere Angaben">
      <FieldGrid>
        {typed.map((answer) => (
          <FieldItem key={answer.key} label={answer.label}>
            {answer.value === null
              ? '—'
              : typeof answer.value === 'boolean'
                ? answer.value
                  ? 'Ja'
                  : 'Nein'
                : answer.value}
          </FieldItem>
        ))}
      </FieldGrid>
    </DetailSection>
  );
}
