// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { usePreviewStatusChange } from './usePreviewStatusChange.js';
import { adminFetch } from '../../auth.js';
vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const activeEvent = { current: 'one' };
const selected = vi.fn();
const busy = vi.fn();
const advance = vi.fn();
const refresh = vi.fn();
let api: ReturnType<typeof usePreviewStatusChange>;
function Harness() {
  const state = usePreviewStatusChange({
    selectedEntry: { id: 'entry', eventId: 'one' } as Entry,
    activeEvent,
    setSelectedEntry: selected,
    setPreviewBusy: busy,
    previewAccepted: advance,
    entriesChanged: refresh,
  });
  useEffect(() => {
    api = state;
  });
  return state.notice?.message;
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  activeEvent.current = 'one';
});
it('reports a rejected preview action and releases the busy state', async () => {
  vi.mocked(adminFetch).mockResolvedValue({ ok: false } as Response);
  await mount();
  await act(async () => api.changeStatus('accepted'));
  expect(host.textContent).toContain('Bitte prüfe den Status');
  expect(busy).toHaveBeenLastCalledWith(false);
  expect(advance).not.toHaveBeenCalled();
});
it('confirms success and keeps the existing advance-to-next-entry behavior', async () => {
  vi.mocked(adminFetch).mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'entry', eventId: 'one' }),
  } as Response);
  await mount();
  await act(async () => api.changeStatus('accepted'));
  expect(host.textContent).toBe('Status geändert');
  expect(advance).toHaveBeenCalledWith({ eventId: 'one', entryId: 'entry' });
  expect(refresh).toHaveBeenCalledOnce();
});
