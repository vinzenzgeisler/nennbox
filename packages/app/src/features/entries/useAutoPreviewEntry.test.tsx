// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EntryResponse } from '@nennbox/contracts';
import { useAutoPreviewEntry } from './useAutoPreviewEntry.js';

const items = [{ id: 'first', acceptanceStatus: 'pending' }] as EntryResponse[];
const workflow = {
  statuses: [
    {
      key: 'pending',
      labels: { de: 'Offen', en: 'Open' },
      color: '#000',
      category: 'pending',
    },
  ],
  transitions: [],
};
const openEntry = vi.fn(async () => undefined);
let width = 1280;
function Probe({ auto = true }: { auto?: boolean }) {
  useAutoPreviewEntry({
    autoSelectFirst: auto,
    eventId: 'event',
    items,
    workflow,
    openEntry,
  });
  return null;
}
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openEntry.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1]),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it('opens the first entry only when list and preview fit side by side', () => {
  width = 1280;
  act(() => root.render(<Probe />));
  expect(openEntry).toHaveBeenCalledExactlyOnceWith('first');
});

it('keeps the list first on a phone even when the caller asks for an automatic preview', () => {
  width = 390;
  act(() => root.render(<Probe />));
  expect(openEntry).not.toHaveBeenCalled();
});

it('does not open an automatic preview just below the breakpoint', () => {
  width = 1100;
  act(() => root.render(<Probe />));
  expect(openEntry).not.toHaveBeenCalled();
  width = 1101;
  act(() => root.render(<Probe auto={false} />));
  act(() => root.render(<Probe />));
  expect(openEntry).toHaveBeenCalledExactlyOnceWith('first');
});
