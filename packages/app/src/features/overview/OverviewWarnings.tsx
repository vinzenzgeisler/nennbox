import type { EventOverview } from '@nennbox/contracts';
import { AppNotice, AppButton, AppView } from '@nennbox/ui';
import {
  warningFilters,
  warningText,
  type EntryFilters,
} from './overviewModel.js';

export function OverviewWarnings({
  eventId,
  warnings,
  onOpenEntries,
}: {
  eventId: string;
  warnings: EventOverview['warnings'];
  onOpenEntries: (filters: EntryFilters) => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <section aria-label="Warnungen">
      <AppView>
        {warnings.map((warning) => {
          const filters = warningFilters(warning, eventId);
          return (
            <AppNotice key={warning.type} tone="warning">
              <>
                <span>{warningText(warning)}</span>
                {filters && (
                  <AppButton
                    tone="secondary"
                    onClick={() => onOpenEntries(filters)}
                  >
                    Anzeigen
                  </AppButton>
                )}
              </>
            </AppNotice>
          );
        })}
      </AppView>
    </section>
  );
}
