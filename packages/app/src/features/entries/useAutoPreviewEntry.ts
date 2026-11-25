import { useEffect, useRef } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { WORKSPACE_PREVIEW_BREAKPOINT } from '@nennbox/ui';
import type { WorkflowView } from './AdminEntriesModel.js';

/** Live check, so a resize after render cannot leave a stale answer behind. */
const previewFitsBesideList = () =>
  typeof window.matchMedia !== 'function' ||
  window.matchMedia(`(min-width: ${WORKSPACE_PREVIEW_BREAKPOINT}px)`).matches;

export function useAutoPreviewEntry({
  autoSelectFirst,
  eventId,
  items,
  workflow,
  selected = null,
  openEntry,
}: {
  autoSelectFirst: boolean;
  eventId: string;
  items: Entry[];
  workflow: WorkflowView | null;
  /** The entry the user already opened: an automatic preview must never replace it. */
  selected?: Entry | null;
  openEntry: (id: string) => Promise<void>;
}) {
  const previewedEvent = useRef('');
  useEffect(() => {
    if (
      !autoSelectFirst ||
      !eventId ||
      !items.length ||
      previewedEvent.current === eventId ||
      !workflow ||
      // List and preview must fit side by side; on narrow screens the list comes first.
      !previewFitsBesideList()
    )
      return;
    previewedEvent.current = eventId;
    // Opening an entry switches the preview on, which re-arms this effect for an event that was
    // never previewed. Re-opening then would close a detail the user just opened (double click).
    if (selected) return;
    const firstPending = items.find(
      (item) =>
        workflow.statuses.find(
          (status) => (status.id ?? status.key) === item.acceptanceStatus,
        )?.category === 'waitlisted',
    );
    void openEntry((firstPending ?? items[0]!).id);
  }, [autoSelectFirst, eventId, items, workflow, selected, openEntry]);
}
