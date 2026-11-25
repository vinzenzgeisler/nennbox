// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest';
import { useEntryWarnings } from './useEntryWarnings.js';
import { EntryWarnings, EntryWarningsStatus } from './EntryWarnings.js';
import type { EntryWarning } from './entryWarnings.js';
vi.mock('../AdminEntriesModel.js', () => ({ request: vi.fn() }));
import { request } from '../AdminEntriesModel.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.mocked(request).mockReset();
});
const warning: EntryWarning = {
  ruleId: 'duplicatePerson',
  entryId: 'one',
  classId: 'class',
  reason: 'Vom Server gelieferter Grund',
  fields: ['email'],
  severity: 'warning',
};
const response = (data: unknown) =>
  ({ ok: true, json: async () => data }) as Response;
function Harness({
  eventId = 'event',
  entryId,
}: {
  eventId?: string;
  entryId?: string;
}) {
  const state = useEntryWarnings(eventId, entryId);
  return (
    <>
      <EntryWarningsStatus status={state.status} retry={state.retry} />
      <EntryWarnings warnings={state.warnings} />
    </>
  );
}
async function mount(entryId?: string) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(<Harness {...(entryId ? { entryId } : {})} />),
  );
}
it('reads one event projection, excludes actions and class-only findings, and preserves reasons/evidence', async () => {
  vi.mocked(request).mockResolvedValue(
    response({
      tasks: [
        warning,
        { ...warning, entryId: null },
        { ...warning, severity: 'task' },
      ],
    }),
  );
  await mount();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/admin/events/event/workbasket',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(host.textContent?.match(/Vom Server gelieferter Grund/g)).toHaveLength(
    1,
  );
  expect(host.textContent).toContain('Betroffene Felder: E-Mail');
});
it('uses the warnings endpoint for detail and rejects foreign entry findings', async () => {
  vi.mocked(request).mockResolvedValue(
    response({
      warnings: [warning, { ...warning, entryId: 'other', reason: 'Foreign' }],
    }),
  );
  await mount('one');
  expect(request).toHaveBeenCalledWith(
    '/admin/events/event/entries/one/warnings',
    expect.anything(),
  );
  expect(host.textContent).toContain(warning.reason);
  expect(host.textContent).not.toContain('Foreign');
});
it('aborts stale entry requests and never paints a late response into the next entry', async () => {
  let finish!: (value: Response) => void;
  vi.mocked(request).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await mount('one');
  const signal = vi.mocked(request).mock.calls[0]![1]!.signal!;
  vi.mocked(request).mockResolvedValue(response({ warnings: [] }));
  await act(async () => root.render(<Harness entryId="two" />));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(response({ warnings: [warning] })));
  expect(host.textContent).not.toContain(warning.reason);
});
it('shows read failures, retries, and refreshes on entry-change notifications', async () => {
  vi.mocked(request).mockResolvedValueOnce({
    ok: false,
    status: 403,
  } as Response);
  await mount('one');
  expect(host.textContent).toContain('Warnungen konnten nicht geladen werden.');
  vi.mocked(request).mockResolvedValue(response({ warnings: [warning] }));
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toContain(warning.reason);
  vi.mocked(request).mockResolvedValue(response({ warnings: [] }));
  await act(async () =>
    window.dispatchEvent(new Event('nennbox:entries-changed')),
  );
  expect(host.textContent).not.toContain(warning.reason);
  expect(request).toHaveBeenCalledTimes(3);
});
it('treats malformed responses as unavailable rather than silently showing no warnings', async () => {
  vi.mocked(request).mockResolvedValue(
    response({ warnings: [{ reason: 'Incomplete' }] }),
  );
  await mount('one');
  expect(host.textContent).toContain('Warnungen konnten nicht geladen werden.');
});
