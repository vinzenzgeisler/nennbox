import { useCallback, useEffect } from 'react';
import { exportsApi } from './exportsApi.js';
import { hasRunningJob } from './exportModel.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';

const POLL_INTERVAL_MS = 2000;

/** The export history of one event. It polls only while a job is still running. */
export function useExportJobs(eventId: string) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const jobs = await exportsApi.list(eventId, signal);
      return Promise.all(
        jobs.map(async (job) => {
          if (job.status !== 'failed') return job;
          try {
            const status = await exportsApi.status(job.jobId, signal);
            return {
              ...job,
              error:
                status.error?.trim() ||
                'Die Verarbeitung ist fehlgeschlagen. Bitte starte den Export erneut.',
            };
          } catch {
            return {
              ...job,
              error:
                'Die Fehlerursache konnte nicht geladen werden. Bitte starte den Export erneut.',
            };
          }
        }),
      );
    },
    [eventId],
  );
  const { state, reload } = useRemoteResource(load);
  const running = state.status === 'ready' && hasRunningJob(state.data);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(reload, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [running, state, reload]);
  return { state, reload };
}
