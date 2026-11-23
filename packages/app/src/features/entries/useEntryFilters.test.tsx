// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { TextInput } from '@nennbox/ui';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEntryFilters } from './useEntryFilters.js';

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let state: ReturnType<typeof useEntryFilters>;
const clearSelection = vi.fn();
function Harness({
  revision = 0,
  filters = {},
  consumed = undefined,
}: {
  revision?: number;
  filters?: import('../overview/overviewModel.js').EntryFilters;
  consumed?: (() => void) | undefined;
}) {
  const current = useEntryFilters(
    'event-a',
    filters,
    revision,
    clearSelection,
    consumed,
  );
  useEffect(() => {
    state = current;
  });
  return <TextInput label="Search" value={current.draft.search} readOnly />;
}
function mount() {
  act(() => root.render(<Harness />));
}
function settleSearch() {
  act(() => vi.advanceTimersByTime(200));
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(
    { shell: 'preserved' },
    '',
    '/admin?eventId=event-a',
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.useFakeTimers();
  clearSelection.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('updates filters in place and retains unrelated URL state without navigation', () => {
  window.history.replaceState(
    { shell: 'preserved' },
    '',
    '/admin?eventId=event-a&other=keep#entries',
  );
  mount();
  const input = host.querySelector('input')!;
  input.focus();
  const push = vi.spyOn(window.history, 'pushState');
  const pop = vi.fn();
  window.addEventListener('popstate', pop);
  act(() =>
    state.setDraft((value) => ({
      ...value,
      search: 'Alex & Sam',
      paymentStatus: 'paid',
      classId: 'class-a',
    })),
  );
  expect(push).not.toHaveBeenCalled();
  settleSearch();
  const params = new URLSearchParams(window.location.search);
  expect(params.get('search')).toBe('Alex & Sam');
  expect(params.get('paymentStatus')).toBe('paid');
  expect(params.get('classId')).toBe('class-a');
  expect(params.get('other')).toBe('keep');
  expect(window.location.hash).toBe('#entries');
  expect(window.history.state).toEqual({ shell: 'preserved' });
  expect(host.querySelector('input')).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(push).toHaveBeenCalledTimes(1);
  expect(pop).not.toHaveBeenCalled();
  window.removeEventListener('popstate', pop);
});

it('hydrates a shared/reloaded URL including page and sorting without resetting page', () => {
  window.history.replaceState(
    null,
    '',
    '/admin?eventId=event-a&search=Alex&verificationStatus=verified&acceptanceStatus=accepted&sort=requestedStartNumber&direction=asc&page=3',
  );
  mount();
  settleSearch();
  expect(state.page).toBe(3);
  expect(state.applied).toMatchObject({
    search: 'Alex',
    verificationStatus: 'verified',
    acceptanceStatus: 'accepted',
    sort: 'requestedStartNumber',
    direction: 'asc',
  });
  expect(new URLSearchParams(window.location.search).get('page')).toBe('3');
});

it('restores Back/Forward state immediately and cancels a pending search without rewriting history', () => {
  mount();
  act(() =>
    state.setDraft((value) => ({ ...value, search: 'pending search' })),
  );
  window.history.replaceState(
    null,
    '',
    '/admin?eventId=event-a&search=restored&page=2',
  );
  const push = vi.spyOn(window.history, 'pushState');
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
  settleSearch();
  expect(state.page).toBe(2);
  expect(state.draft.search).toBe('restored');
  expect(state.applied.search).toBe('restored');
  expect(push).not.toHaveBeenCalled();
  expect(clearSelection).toHaveBeenCalledTimes(1);
});

it('applies explicit shell filter revisions without remounting the controls', () => {
  mount();
  const input = host.querySelector('input');
  act(() =>
    root.render(
      <Harness revision={1} filters={{ search: 'palette result' }} />,
    ),
  );
  settleSearch();
  expect(host.querySelector('input')).toBe(input);
  expect(state.applied.search).toBe('palette result');
  expect(new URLSearchParams(window.location.search).get('search')).toBe(
    'palette result',
  );
});

it('does not accept invalid page or sort values from shared URLs', () => {
  window.history.replaceState(
    null,
    '',
    '/admin?eventId=event-a&page=-3&sort=invalid&direction=sideways',
  );
  mount();
  expect(state.page).toBe(1);
  expect(state.applied.sort).toBe('createdAt');
  expect(state.applied.direction).toBe('desc');
});

it('handles actual browser Back and Forward without adding history entries', async () => {
  mount();
  act(() => state.setDraft((value) => ({ ...value, search: 'first' })));
  settleSearch();
  act(() => state.setDraft((value) => ({ ...value, search: 'second' })));
  settleSearch();
  const length = window.history.length;
  vi.useRealTimers();
  const travel = async (direction: 'back' | 'forward') => {
    await act(async () => {
      const restored = new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
      });
      window.history[direction]();
      await restored;
    });
  };
  await travel('back');
  expect(state.applied.search).toBe('first');
  expect(state.draft.search).toBe('first');
  await travel('forward');
  expect(state.applied.search).toBe('second');
  expect(window.history.length).toBe(length);
});

it('consumes shell targets once so a later remount restores edited URL filters', () => {
  let target: import('../overview/overviewModel.js').EntryFilters = {
    search: 'original target',
  };
  const consumed = vi.fn(() => {
    target = {};
  });
  act(() =>
    root.render(<Harness revision={1} filters={target} consumed={consumed} />),
  );
  expect(consumed).toHaveBeenCalledOnce();
  act(() => state.setDraft((value) => ({ ...value, search: 'edited search' })));
  settleSearch();
  act(() => state.setPage(3));
  act(() => root.render(null));
  act(() =>
    root.render(<Harness revision={1} filters={target} consumed={consumed} />),
  );
  expect(state.applied.search).toBe('edited search');
  expect(state.page).toBe(3);
  expect(consumed).toHaveBeenCalledOnce();
});
