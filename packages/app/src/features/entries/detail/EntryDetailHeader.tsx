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
          <span
            className="nb-entry-identity-image"
            role="img"
            aria-label="Kein Fahrzeugbild"
          >
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="27" r="6" />
              <circle cx="30" cy="27" r="6" />
              <path d="M10 27l8-9h9l3 9M18 18l3-5h7" />
            </svg>
          </span>
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
