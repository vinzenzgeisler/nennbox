import type { EventOverview } from '@nennbox/contracts';
import {
  AppValueRow,
  AppWorkflowPill,
  AppButton,
  AppSection,
} from '@nennbox/ui';
import {
  statusRows,
  type EntryFilters,
  type OverviewStatus,
} from './overviewModel.js';

export function OverviewStatuses({
  statuses,
  workflowStatuses,
  onOpenEntries,
}: {
  statuses: EventOverview['statuses'];
  workflowStatuses: OverviewStatus[];
  onOpenEntries: (filters: EntryFilters) => void;
}) {
  const rows = statusRows(statuses, workflowStatuses);
  return (
    <AppSection title="Nennungen je Status">
      {rows.length === 0 ? (
        <p>Noch keine Nennungen.</p>
      ) : (
        <div>
          {rows.map((row) => (
            <AppValueRow
              key={row.key}
              label={
                <AppWorkflowPill
                  label={row.label}
                  color={
                    workflowStatuses.find((status) => status.key === row.key)
                      ?.color ?? '#64748b'
                  }
                />
              }
            >
              <AppButton
                tone="ghost"
                aria-label={`${row.label}: ${row.count} Nennungen anzeigen`}
                onClick={() => onOpenEntries({ acceptanceStatus: row.key })}
              >
                {row.count}
              </AppButton>
            </AppValueRow>
          ))}
        </div>
      )}
    </AppSection>
  );
}
