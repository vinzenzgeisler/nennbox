// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import {
  EntrySelectionProvider,
  useEntryBulkSelection,
} from './EntrySelectionState.js';

it('keeps multi-selection across view remounts, isolated by event and app instance', () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  let state: ReturnType<typeof useEntryBulkSelection>;
  function List({ eventId }: { eventId: string }) {
    state = useEntryBulkSelection(eventId);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = (eventId: string | null) =>
    act(() =>
      root.render(
        <EntrySelectionProvider>
          {eventId ? (
            <List key={eventId} eventId={eventId} />
          ) : (
            <p>Other view</p>
          )}
        </EntrySelectionProvider>,
      ),
    );
  render('a');
  act(() => state![1]({ eventId: 'a', ids: new Set(['one', 'two']) }));
  render(null);
  render('a');
  expect([...state![0].ids]).toEqual(['one', 'two']);
  render('b');
  expect(state![0].ids.size).toBe(0);
  act(() => state![1]({ eventId: 'b', ids: new Set(['other']) }));
  render('a');
  expect([...state![0].ids]).toEqual(['one', 'two']);
  act(() => root.render(null));
  render('a');
  expect(state![0].ids.size).toBe(0);
  act(() => root.unmount());
});
