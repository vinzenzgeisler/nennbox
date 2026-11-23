import { useEffect, useRef } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';

export function useAutoPreviewEntry({
  autoSelectFirst,
  eventId,
  items,
  workflow,
  openEntry,
}: {
  autoSelectFirst: boolean;
  eventId: string;
  items: Entry[];
  workflow: WorkflowView | null;
  openEntry: (id: string) => Promise<void>;
}) {
  const previewedEvent = useRef('');
  useEffect(() => {
    if (
      !autoSelectFirst ||
      !eventId ||
      !items.length ||
      previewedEvent.current === eventId ||
      !workflow
    )
      return;
    previewedEvent.current = eventId;
    const firstPending = items.find(
      (item) =>
        workflow.statuses.find((status) => status.key === item.acceptanceStatus)
          ?.category === 'waitlisted',
    );
    void openEntry((firstPending ?? items[0]!).id);
  }, [autoSelectFirst, eventId, items, workflow, openEntry]);
}
