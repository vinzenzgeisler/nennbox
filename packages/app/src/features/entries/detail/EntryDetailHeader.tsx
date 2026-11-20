import { DetailHeader } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';
import { formatDateTime, lastChangeAt } from './entryDetailModel.js';
import { EntryDetailLabels } from './EntryDetailLabels.js';

export function EntryDetailHeader({
  entry,
  workflow,
  onBack,
}: {
  entry: Entry;
  workflow: WorkflowView | null;
  onBack: () => void;
}) {
  const details = entry.adminDetails!;
  const changed = lastChangeAt(entry);
  return (
    <DetailHeader
      backLabel="Nennungen"
      onBack={onBack}
      number={entry.requestedStartNumber ?? details.startNumber}
      title={`${details.driver.name} · ${details.vehicle.make} ${details.vehicle.model}`}
      subtitle={[
        `Klasse ${details.eventClass.name}`,
        entry.orgaCode ? `Orga-Code ${entry.orgaCode}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      meta={
        <>
          Eingang {formatDateTime(entry.createdAt)}
          {changed && <> · Geändert {formatDateTime(changed)}</>}
        </>
      }
      labels={<EntryDetailLabels entry={entry} workflow={workflow} />}
    />
  );
}
