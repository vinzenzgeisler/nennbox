import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { EntryResponse, type EntryResponse as Entry } from '@nennbox/contracts';
import { request, type WorkflowView } from './AdminEntriesModel.js';

type Notice = { message: string; undo?: () => void };
async function submit(
  entry: Entry,
  to: string,
  reason: string,
): Promise<Entry> {
  const response = await request(
    `/admin/entries/${encodeURIComponent(entry.id)}/transitions`,
    {
      method: 'POST',
      body: JSON.stringify({ transition: 'acceptance', status: to, reason }),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Du darfst den Status nicht ändern.'
        : 'Statusänderung fehlgeschlagen. Bitte versuche es erneut.',
    );
  return EntryResponse.parse(await response.json());
}
/** List status changes use the same authenticated transition endpoint as the detail. */
export function useEntryListStatusChanges({
  eventId,
  workflow,
  setSelected,
  setRefreshRevision,
  setActionError,
}: {
  eventId: string;
  workflow: WorkflowView | null;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
  setRefreshRevision: Dispatch<SetStateAction<number>>;
  setActionError: Dispatch<SetStateAction<string>>;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setNotice(null);
    return () => {
      generation.current += 1;
    };
  }, [eventId]);
  const apply = useCallback(
    (updated: Entry) => {
      if (updated.eventId !== eventId) return;
      setSelected((current) =>
        current?.id === updated.id ? updated : current,
      );
      setRefreshRevision((value) => value + 1);
    },
    [eventId, setSelected, setRefreshRevision],
  );
  const changeStatus = useCallback(
    async (entry: Entry, to: string) => {
      if (pending.current) return;
      const requestedGeneration = generation.current;
      const target = workflow?.statuses.find((status) => status.key === to);
      const edge = workflow?.transitions.find(
        (item) => item.from === entry.acceptanceStatus && item.to === to,
      );
      if (!target || !edge) return;
      const inverse =
        !edge.notify &&
        workflow?.transitions.some(
          (item) =>
            item.from === to &&
            item.to === entry.acceptanceStatus &&
            !item.notify,
        );
      if (
        !inverse &&
        !window.confirm(
          `Status für diese Nennung zu „${target.labels.de}“ ändern?`,
        )
      )
        return;
      pending.current = true;
      setActionError('');
      try {
        const updated = await submit(
          entry,
          to,
          'Status in der Nennungsliste geändert',
        );
        if (
          generation.current !== requestedGeneration ||
          updated.id !== entry.id ||
          updated.eventId !== eventId
        )
          return;
        apply(updated);
        setNotice({
          message: `Status: ${target.labels.de}`,
          ...(inverse
            ? {
                undo: async () => {
                  if (
                    pending.current ||
                    generation.current !== requestedGeneration
                  )
                    return;
                  pending.current = true;
                  setNotice(null);
                  try {
                    const restored = await submit(
                      updated,
                      entry.acceptanceStatus,
                      'Statusänderung rückgängig gemacht',
                    );
                    if (generation.current !== requestedGeneration) return;
                    apply(restored);
                    setNotice({ message: 'Statusänderung rückgängig gemacht' });
                  } catch (error) {
                    if (generation.current !== requestedGeneration) return;
                    setActionError(
                      error instanceof Error
                        ? error.message
                        : 'Rückgängig fehlgeschlagen. Bitte prüfe den Status.',
                    );
                  } finally {
                    if (generation.current === requestedGeneration)
                      pending.current = false;
                  }
                },
              }
            : {}),
        });
      } catch (error) {
        if (generation.current !== requestedGeneration) return;
        setActionError(
          error instanceof Error
            ? error.message
            : 'Statusänderung fehlgeschlagen. Bitte prüfe den Status.',
        );
      } finally {
        if (generation.current === requestedGeneration) pending.current = false;
      }
    },
    [eventId, workflow, apply, setActionError],
  );
  const clearNotice = useCallback(() => setNotice(null), []);
  return { changeStatus, notice, clearNotice };
}
