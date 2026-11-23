import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';

/** A request to open an existing detail handler, never a direct mutation. */
export type EntryQuickAction =
  | { kind: 'message' }
  | { kind: 'documents' }
  | { kind: 'start_number' }
  | { kind: 'cancel'; to: string }
  | { kind: 'delete' };

export type EntryQuickActionRequest = {
  entryId: string;
  action: EntryQuickAction;
  /** Monotonic token lets the same action be requested again after dismissal. */
  token: number;
};
export type OnEntryQuickAction = (
  entryId: string,
  action: EntryQuickAction,
) => void;

export function quickStatusTransitions(
  entry: Entry,
  workflow: WorkflowView | null,
) {
  return (workflow?.transitions ?? []).filter(
    (edge) =>
      edge.from === entry.acceptanceStatus &&
      entry.availableActions?.includes(`acceptance:${edge.to}`),
  );
}

export function quickCancellation(entry: Entry, workflow: WorkflowView | null) {
  return quickStatusTransitions(entry, workflow).find((edge) =>
    workflow?.statuses.some(
      (status) => status.key === edge.to && status.category === 'withdrawn',
    ),
  );
}

export function canRequestQuickAction(
  entry: Entry,
  action: EntryQuickAction,
  workflow: WorkflowView | null,
  canMessage: boolean,
): boolean {
  if (action.kind === 'message' || action.kind === 'documents')
    return canMessage && Boolean(entry.availableActions?.includes('message'));
  if (action.kind === 'cancel')
    return quickCancellation(entry, workflow)?.to === action.to;
  return entry.availableActions?.includes(action.kind) ?? false;
}
