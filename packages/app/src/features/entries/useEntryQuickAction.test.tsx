// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';
import type { EntryQuickActionRequest } from './entryQuickActions.js';
import { useEntryQuickAction } from './useEntryQuickAction.js';
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
const workflow = {
  statuses: [{ key: 'withdrawn', category: 'withdrawn' }],
  transitions: [{ from: 'open', to: 'withdrawn' }],
} as WorkflowView;
const entry = {
  id: 'one',
  acceptanceStatus: 'open',
  availableActions: ['delete', 'acceptance:withdrawn', 'start_number'],
} as Entry;
it('opens existing confirmation state rather than performing cancel or delete directly', () => {
  const setPending = vi.fn();
  const props = {
    entry,
    workflow,
    setPending,
    setTab: vi.fn(),
    setNumberOpen: vi.fn(),
    onHandled: vi.fn(),
  };
  function Harness({ request }: { request: EntryQuickActionRequest }) {
    useEntryQuickAction({ ...props, request });
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <Harness
        request={{
          entryId: 'one',
          token: 1,
          action: { kind: 'cancel', to: 'withdrawn' },
        }}
      />,
    ),
  );
  expect(setPending).toHaveBeenLastCalledWith({
    kind: 'status',
    step: { to: 'withdrawn', label: 'Nennung absagen', danger: true },
  });
  act(() =>
    root.render(
      <Harness
        request={{ entryId: 'one', token: 2, action: { kind: 'delete' } }}
      />,
    ),
  );
  expect(setPending).toHaveBeenLastCalledWith({
    kind: 'admin',
    action: 'delete',
  });
});
it('ignores a request addressed to another selected entry', () => {
  const setPending = vi.fn();
  function Harness() {
    useEntryQuickAction({
      entry,
      workflow,
      setPending,
      setTab: vi.fn(),
      setNumberOpen: vi.fn(),
      request: { entryId: 'other', token: 1, action: { kind: 'delete' } },
    });
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
  expect(setPending).not.toHaveBeenCalled();
});
