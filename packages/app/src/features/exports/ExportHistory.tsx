import { relativeEntryTime } from '../entries/detail/relativeEntryTime.js';
import type { ExportJob } from '@nennbox/contracts';
import {
  AppButton,
  AppTable,
  AppSection,
  AppStatusPill,
  AppEmptyState,
} from '@nennbox/ui';
import {
  describeFilters,
  safeDownloadPath,
  STATE_LABELS,
  STATE_TONES,
} from './exportModel.js';

export function ExportHistory({
  jobs,
  classes,
  statuses,
  downloading,
  onDownload,
}: {
  jobs: ExportJob[];
  classes: Map<string, string>;
  statuses: Map<string, string>;
  downloading: string | null;
  onDownload: (job: ExportJob, path: string) => void;
}) {
  return (
    <AppSection title="Bisherige Exporte">
      {jobs.length === 0 ? (
        <AppEmptyState
          title="Noch keine Exporte"
          description="Erstelle einen CSV-Export für diese Veranstaltung."
        />
      ) : (
        <AppTable headers={['Erstellt', 'Filter', 'Status', 'Datei']}>
          {jobs.map((job) => {
            const path = safeDownloadPath(job.downloadUrl);
            return (
              <tr key={job.jobId}>
                <td>
                  <time dateTime={job.createdAt}>
                    {relativeEntryTime(job.createdAt)}
                  </time>
                </td>
                <td>{describeFilters(job.filters, { classes, statuses })}</td>
                <td>
                  <AppStatusPill status={STATE_TONES[job.status]}>
                    {STATE_LABELS[job.status]}
                  </AppStatusPill>
                </td>
                <td>
                  {job.status === 'finished' && path ? (
                    <AppButton
                      tone="secondary"
                      disabled={downloading === job.jobId}
                      onClick={() => onDownload(job, path)}
                    >
                      Herunterladen
                    </AppButton>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </AppTable>
      )}
    </AppSection>
  );
}
