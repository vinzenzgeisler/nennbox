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
  onRetry,
  retrying = false,
}: {
  jobs: ExportJob[];
  classes: Map<string, string>;
  statuses: Map<string, string>;
  downloading: string | null;
  onDownload: (job: ExportJob, path: string) => void;
  onRetry?: (job: ExportJob) => void;
  retrying?: boolean;
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
                  {job.status === 'failed' && (
                    <p>
                      {job.error ||
                        'Die Verarbeitung ist fehlgeschlagen. Bitte starte den Export erneut.'}
                    </p>
                  )}
                </td>
                <td>
                  {job.status === 'finished' && path ? (
                    <AppButton
                      tone="secondary"
                      disabled={downloading === job.jobId}
                      onClick={() => onDownload(job, path)}
                    >
                      CSV herunterladen
                    </AppButton>
                  ) : job.status === 'failed' && onRetry ? (
                    <AppButton
                      tone="secondary"
                      disabled={retrying}
                      onClick={() => onRetry(job)}
                    >
                      Mit gleichen Einstellungen erneut starten
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
