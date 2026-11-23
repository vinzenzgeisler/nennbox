import type { EventOverview } from '@nennbox/contracts';
import { AppSection, OccupancyBar } from '@nennbox/ui';

import type { EntryFilters } from './overviewModel.js';

const valueText = (occupied: number, capacity: number | null): string =>
  capacity === null
    ? `${occupied} belegt, ohne Limit`
    : `${occupied} von ${capacity} belegt`;

export function OverviewClasses({
  classes,
  onOpenEntries,
}: {
  classes: EventOverview['classes'];
  onOpenEntries: (filters: EntryFilters) => void;
}) {
  return (
    <AppSection title="Belegung je Klasse">
      {classes.length === 0 ? (
        <p>Für diese Veranstaltung sind noch keine Klassen angelegt.</p>
      ) : (
        <>
          {classes.map((item) => (
            <div key={item.classId}>
              <OccupancyBar
                label={item.name}
                occupied={item.occupied}
                capacity={item.capacity}
                unlimitedLabel="Ohne Limit"
                fullLabel="Voll"
                valueText={valueText(item.occupied, item.capacity)}
                onOpenEntries={() => onOpenEntries({ classId: item.classId })}
              />
            </div>
          ))}
        </>
      )}
    </AppSection>
  );
}
