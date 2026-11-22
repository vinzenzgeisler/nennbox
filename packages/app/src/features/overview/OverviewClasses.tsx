import type { EventOverview } from '@nennbox/contracts';
import { AppSection, OccupancyBar } from '@nennbox/ui';

const valueText = (occupied: number, capacity: number | null): string =>
  capacity === null
    ? `${occupied} belegt, ohne Limit`
    : `${occupied} von ${capacity} belegt`;

export function OverviewClasses({
  classes,
}: {
  classes: EventOverview['classes'];
}) {
  return (
    <AppSection title="Belegung je Klasse">
      {classes.length === 0 ? (
        <p>Für diese Veranstaltung sind noch keine Klassen angelegt.</p>
      ) : (
        <>
          {classes.map((item) => (
            <OccupancyBar
              key={item.classId}
              label={item.name}
              occupied={item.occupied}
              capacity={item.capacity}
              unlimitedLabel="Ohne Limit"
              fullLabel="Voll"
              valueText={valueText(item.occupied, item.capacity)}
            />
          ))}
        </>
      )}
    </AppSection>
  );
}
