import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';
export function usePreviewStatusChange({
  selectedEntry,
  activeEvent,
  setPreviewBusy,
  setSelectedEntry,
  previewAccepted,
  entriesChanged,
}: {
  selectedEntry: Entry | null;
  activeEvent: MutableRefObject<string>;
  setPreviewBusy: Dispatch<SetStateAction<boolean>>;
  setSelectedEntry: Dispatch<SetStateAction<Entry | null>>;
  previewAccepted: (value: { eventId: string; entryId: string }) => void;
  entriesChanged: () => void;
}) {
  const [notice, setNotice] = useState<{
    eventId: string;
    message: string;
  } | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  async function changeStatus(status: string) {
    if (!selectedEntry) return;
    const requestedEvent = activeEvent.current;
    const requestedEntry = selectedEntry.id;
    setPreviewBusy(true);
    try {
      const response = await adminFetch(
        `/admin/entries/${selectedEntry.id}/transitions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            transition: 'acceptance',
            status,
            reason: 'In der Nennungsvorschau entschieden',
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          'Statusänderung fehlgeschlagen. Bitte prüfe den Status und versuche es erneut.',
        );
      if (response.ok) {
        const updated = (await response.json()) as Entry;
        // The answer may only update the entry that is still open in the same event.
        if (activeEvent.current === requestedEvent) {
          setSelectedEntry((current) =>
            current?.id === requestedEntry ? updated : current,
          );
          setNotice({ eventId: requestedEvent, message: 'Status geändert' });
          previewAccepted({
            eventId: requestedEvent,
            entryId: requestedEntry,
          });
        }
        entriesChanged();
      }
    } catch {
      if (activeEvent.current === requestedEvent)
        setNotice({
          eventId: requestedEvent,
          message:
            'Statusänderung fehlgeschlagen. Bitte prüfe den Status und versuche es erneut.',
        });
    } finally {
      if (activeEvent.current === requestedEvent) setPreviewBusy(false);
    }
  }
  return {
    changeStatus,
    notice: notice?.eventId === activeEvent.current ? notice : null,
    clearNotice,
  };
}
