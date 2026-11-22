// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { EntryStartNumber } from './EntryStartNumber.js';
import { adminFetch } from '../../../auth.js';
vi.mock('../../../auth.js', () => ({ adminFetch: vi.fn() }));
vi.mock('@nennbox/contracts', () => ({
  EntryResponse: { parse: (value: unknown) => value },
}));
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.resetAllMocks();
});
const entry = {
  id: 'one',
  eventId: 'event',
  requestedStartNumber: '42',
  assignedStartNumber: '77',
  startNumberStatus: 'assigned',
} as Entry;
function mount(selected = entry) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const updated = vi.fn();
  act(() =>
    root!.render(<EntryStartNumber entry={selected} onUpdated={updated} />),
  );
  return updated;
}
it('initializes from the assignment, not the wish, and uses the authoritative read after saving', async () => {
  const updated = mount();
  expect(host.querySelector('input')?.value).toBe('77');
  vi.mocked(adminFetch)
    .mockResolvedValueOnce(new Response('{"ok":true}'))
    .mockResolvedValueOnce(new Response(JSON.stringify(entry)));
  await act(async () => host.querySelector('button')!.click());
  expect(adminFetch).toHaveBeenNthCalledWith(
    1,
    '/admin/events/event/entries/one/start-number',
    expect.objectContaining({ method: 'PUT', body: '{"startNumber":"77"}' }),
  );
  expect(adminFetch).toHaveBeenNthCalledWith(2, '/admin/entries/one');
  expect(updated).toHaveBeenCalledWith(entry);
  expect(updated.mock.calls[0]![0].requestedStartNumber).toBe('42');
});
it('does not prefill an unconfirmed wish as an assignment', () => {
  mount({
    ...entry,
    assignedStartNumber: null,
    startNumberStatus: 'requested',
  });
  expect(host.querySelector('input')?.value).toBe('');
});
it('reports a successful write with failed refresh without fabricating local allocation', async () => {
  const updated = mount();
  vi.mocked(adminFetch)
    .mockResolvedValueOnce(new Response('{"ok":true}'))
    .mockRejectedValueOnce(new Error('network'));
  await act(async () => host.querySelector('button')!.click());
  expect(updated).not.toHaveBeenCalled();
  expect(host.textContent).toContain(
    'Startnummer gespeichert. Bitte lade die Nennung neu.',
  );
  expect(host.textContent).not.toContain('Nummer belegt');
});
