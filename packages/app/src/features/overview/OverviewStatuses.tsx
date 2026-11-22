import type { EventOverview } from '@nennbox/contracts';
import {
  AppValueRow,
  AppStatusPill,
  AppSection,
  type AppStatus,
} from '@nennbox/ui';
import { statusRows } from './overviewModel.js';

const STATUS_TONES: Record<string, AppStatus> = {
  pending: 'offen',
  waitlisted: 'vor',
  accepted: 'zu',
  rejected: 'neg',
  withdrawn: 'ab',
};

export function OverviewStatuses({
  statuses,
}: {
  statuses: EventOverview['statuses'];
}) {
  const rows = statusRows(statuses);
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
                <AppStatusPill status={STATUS_TONES[row.key] ?? 'offen'}>
                  {row.label}
                </AppStatusPill>
              }
            >
              {row.count}
            </AppValueRow>
          ))}
        </div>
      )}
    </AppSection>
  );
}
