import { expect, it } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';
import {
  canRequestQuickAction,
  quickCancellation,
  quickStatusTransitions,
} from './entryQuickActions.js';
const workflow = {
  statuses: [{ key: 'cancelled', category: 'withdrawn' }],
  transitions: [
    { from: 'open', to: 'accepted' },
    { from: 'open', to: 'cancelled' },
    { from: 'other', to: 'cancelled' },
  ],
} as WorkflowView;
const entry = { id: 'one', acceptanceStatus: 'open' } as Entry;
it('does not infer mutation capabilities from workflow configuration', () => {
  expect(quickStatusTransitions(entry, workflow)).toEqual([]);
  expect(quickCancellation(entry, workflow)).toBeUndefined();
  expect(canRequestQuickAction(entry, { kind: 'delete' }, workflow, true)).toBe(
    false,
  );
  expect(
    canRequestQuickAction(entry, { kind: 'start_number' }, workflow, true),
  ).toBe(false);
});
it('only offers transitions explicitly authorized by the API', () => {
  const allowed = {
    ...entry,
    availableActions: ['acceptance:cancelled', 'delete', 'start_number'],
  };
  expect(
    quickStatusTransitions(allowed, workflow).map((step) => step.to),
  ).toEqual(['cancelled']);
  expect(
    canRequestQuickAction(
      allowed,
      { kind: 'cancel', to: 'cancelled' },
      workflow,
      false,
    ),
  ).toBe(true);
  expect(
    canRequestQuickAction(
      allowed,
      { kind: 'cancel', to: 'accepted' },
      workflow,
      false,
    ),
  ).toBe(false);
  expect(
    canRequestQuickAction(allowed, { kind: 'delete' }, workflow, false),
  ).toBe(true);
});
it('hides communication actions without a connected composer', () => {
  expect(
    canRequestQuickAction(entry, { kind: 'message' }, workflow, false),
  ).toBe(false);
  expect(
    canRequestQuickAction(entry, { kind: 'documents' }, workflow, false),
  ).toBe(false);
  expect(
    canRequestQuickAction(entry, { kind: 'message' }, workflow, true),
  ).toBe(true);
});
