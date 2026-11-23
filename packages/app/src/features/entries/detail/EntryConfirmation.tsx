import { useEffect, useRef, useState } from 'react';
import { Button, DetailSection } from '@nennbox/ui';
import { ExportQueuedSchema, type ExportJobState } from '@nennbox/contracts';
import { adminFetch } from '../../../auth.js';
import { readJson } from '../../remote/apiRequest.js';
import { downloadProtectedFile } from '../../remote/saveBlob.js';
import { exportsApi } from '../../exports/exportsApi.js';

const POLL_INTERVAL_MS = 2000;

type PdfJob = { id: string; status: ExportJobState };

/** The backend generates a fresh PDF artifact for this registration group. */
export function EntryConfirmation({
  eventId,
  groupId,
}: {
  eventId: string;
  groupId: string;
}) {
  const [job, setJob] = useState<PdfJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!job || job.status !== 'running' || statusError) return;
    const request = new AbortController();
    const timer = window.setTimeout(() => {
      void exportsApi
        .status(job.id, request.signal)
        .then((status) => {
          if (!request.signal.aborted) {
            setError('');
            setJob({ id: job.id, status: status.status });
          }
        })
        .catch(() => {
          if (!request.signal.aborted) {
            setStatusError(true);
            setError('Der PDF-Status konnte nicht geladen werden.');
          }
        });
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
      request.abort();
    };
  }, [job, statusError]);
  async function create() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    try {
      const response = await adminFetch(
        `/admin/events/${encodeURIComponent(eventId)}/registration-groups/${encodeURIComponent(groupId)}/confirmation`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          signal: request.signal,
        },
      );
      const queued = await readJson(response, ExportQueuedSchema);
      if (!request.signal.aborted)
        setJob({ id: queued.jobId, status: 'running' });
    } catch {
      if (!request.signal.aborted)
        setError('Die Nennbestätigung konnte nicht erstellt werden.');
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  async function download() {
    if (!job) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setError('');
    try {
      await downloadProtectedFile(
        `/admin/artifact-jobs/${encodeURIComponent(job.id)}/download`,
        'nennbestaetigung.pdf',
        request.signal,
      );
    } catch {
      if (!request.signal.aborted)
        setError('Die Nennbestätigung konnte nicht heruntergeladen werden.');
    }
  }
  return (
    <DetailSection title="Nennbestätigung">
      {error && <p role="alert">{error}</p>}
      {job?.status === 'running' && !statusError && (
        <p role="status">PDF wird erstellt …</p>
      )}
      {statusError && (
        <Button
          variant="secondary"
          onClick={() => {
            setError('');
            setStatusError(false);
          }}
        >
          PDF-Status erneut laden
        </Button>
      )}
      {job?.status === 'failed' && (
        <p role="alert">Die PDF-Erstellung ist fehlgeschlagen.</p>
      )}
      {job?.status === 'expired' && (
        <p>Die Datei ist abgelaufen. Erstelle sie erneut.</p>
      )}
      {job?.status === 'finished' ? (
        <Button variant="secondary" onClick={() => void download()}>
          PDF herunterladen
        </Button>
      ) : (
        !statusError && (
          <Button
            variant="secondary"
            disabled={busy || job?.status === 'running'}
            onClick={() => void create()}
          >
            {busy ? 'PDF wird angefordert …' : 'PDF erstellen'}
          </Button>
        )
      )}
    </DetailSection>
  );
}
