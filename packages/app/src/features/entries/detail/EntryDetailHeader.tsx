import { AppThumb } from '@nennbox/ui';
import type { ReactNode } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
export function EntryDetailHeader({
  entry,
  actions,
}: {
  entry: Entry;
  actions: ReactNode;
}) {
  const details = entry.adminDetails!;
  return (
    <>
      <div className="nb-entry-identity">
        {details.vehicle.imageUrl ? (
          <img
            className="nb-entry-identity-image"
            src={details.vehicle.imageUrl}
            alt="Fahrzeugbild"
          />
        ) : (
          <AppThumb className="nb-entry-identity-image" />
        )}
        <div>
          <h1>{details.driver.name}</h1>
          <p>
            Nr. {entry.requestedStartNumber ?? details.startNumber ?? '—'} ·{' '}
            {details.vehicle.make} {details.vehicle.model} ·{' '}
            {details.eventClass.name}
            {entry.orgaCode && (
              <>
                {' '}
                · <code>{entry.orgaCode}</code>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="nb-entry-header-actions">{actions}</div>
    </>
  );
}
