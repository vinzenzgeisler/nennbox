import { requestableUploads } from './documents/documentLines.js';
import { requestMessageSeed } from './documents/requestMessage.js';
import { useEffect, useRef } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';
import type { Pending } from './detail/EntryDetailPending.js';
import type { MessageSeed } from '../messages/messageSeed.js';
import {
  canRequestQuickAction,
  type EntryQuickActionRequest,
} from './entryQuickActions.js';

/** Routes row requests into the detail's existing editors and confirmation dialogs. */
export function useEntryQuickAction({
  request,
  entry,
  workflow,
  onMessage,
  setTab,
  setNumberOpen,
  setPending,
  onHandled,
}: {
  request?: EntryQuickActionRequest | null | undefined;
  entry: Entry;
  workflow: WorkflowView | null;
  onMessage?: ((seed: MessageSeed) => void) | undefined;
  setTab: (tab: string) => void;
  setNumberOpen: (open: boolean) => void;
  setPending: (pending: Pending) => void;
  onHandled?: (() => void) | undefined;
}) {
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    if (
      !request ||
      request.entryId !== entry.id ||
      consumed.current === request.token
    )
      return;
    const { action } = request;
    // The detail's read hook hydrates capabilities before opening a mutation UI.
    if (!entry.availableActions) return;
    consumed.current = request.token;
    if (canRequestQuickAction(entry, action, workflow, Boolean(onMessage))) {
      if (action.kind === 'message') onMessage?.({ entryId: entry.id });
      else if (action.kind === 'documents') {
        const line = requestableUploads(entry)[0];
        if (line) onMessage?.(requestMessageSeed(entry.id, line));
        else setTab('documents');
      } else if (action.kind === 'start_number') {
        setTab('overview');
        setNumberOpen(true);
      } else if (action.kind === 'delete')
        setPending({ kind: 'admin', action: 'delete' });
      else
        setPending({
          kind: 'status',
          step: {
            to: action.to,
            label: 'Nennung absagen',
            danger: true,
          },
        });
    }
    onHandled?.();
  }, [
    request,
    entry,
    workflow,
    onMessage,
    setTab,
    setNumberOpen,
    setPending,
    onHandled,
  ]);
}
