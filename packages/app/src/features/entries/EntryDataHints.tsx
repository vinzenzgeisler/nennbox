import type { EntryResponse as Entry } from '@nennbox/contracts';
import { AppButton, HintLabel } from '@nennbox/ui';
import { numberWish } from './entryStartNumber.js';

/** Compact data labels shared by the list, preview and properties. */
export function EntryDataHints({
  entry,
  onOpenRelated,
  busy = false,
}: {
  entry: Entry;
  onOpenRelated?: ((id: string) => Promise<void>) | undefined;
  busy?: boolean;
}) {
  const wish = numberWish(entry);
  return (
    <>
      {wish && <HintLabel>Wunsch: {wish}</HintLabel>}
      {entry.statusProjection?.hints
        .filter((hint) => hint.present)
        .map((hint) => (
          <HintLabel key={hint.key}>
            {hint.key === 'double_starter'
              ? 'Doppelstarter'
              : hint.key === 'passenger'
                ? 'mit Beifahrer'
                : 'Nachnennung'}
            {hint.key === 'double_starter' &&
              hint.relatedEntries?.map((related, index) => {
                const label = related.startNumber
                  ? `Nr. ${related.startNumber}`
                  : `Weitere Nennung ${index + 1} (ohne Startnummer)`;
                return (
                  <span key={related.entryId}>
                    {' · '}
                    {onOpenRelated ? (
                      <AppButton
                        tone="ghost"
                        disabled={busy}
                        onClick={() => void onOpenRelated(related.entryId)}
                      >
                        {label}
                      </AppButton>
                    ) : (
                      label
                    )}
                  </span>
                );
              })}
          </HintLabel>
        ))}
    </>
  );
}
