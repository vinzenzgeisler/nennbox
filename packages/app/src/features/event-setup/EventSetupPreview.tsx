import { AppPreviewCard, AppSection } from '@nennbox/ui';
import { formatFeeText, formatRange } from '../../format.js';
import type { SetupDraft } from './eventSetupApi.js';

/** The public-entry summary beside the setup form; dates and fees in German format. */
export function EventSetupPreview({ draft }: { draft: SetupDraft }) {
  return (
    <AppSection title="Öffentliche Nennung">
      <AppPreviewCard>
        <strong>{draft.name || 'Name der Veranstaltung'}</strong>
        <span>
          {draft.startsOn
            ? formatRange(draft.startsOn, draft.endsOn)
            : 'Beginn'}
        </span>
        <span>
          {draft.classes.length} Klasse
          {draft.classes.length === 1 ? '' : 'n'}
        </span>
        {draft.classes.slice(0, 3).map((item, index) => (
          <span key={item.id ?? `${item.code}-${index}`}>
            {item.name || 'Klassenname'} · {formatFeeText(item.fee)}
          </span>
        ))}
        {draft.classes.length > 3 && (
          <span>+ {draft.classes.length - 3} weitere</span>
        )}
      </AppPreviewCard>
      <p>Die Vorschau zeigt die wichtigsten Angaben vor dem Veröffentlichen.</p>
    </AppSection>
  );
}
