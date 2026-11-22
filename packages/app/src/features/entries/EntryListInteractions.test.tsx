// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { DataTable, EntryListRow, EntryStatusMenu } from '@nennbox/ui';
import { useEntryListStatusChanges } from './useEntryListStatusChanges.js';
import { EntryStatusToast } from './EntryStatusToast.js';
import { useAdminEntriesKeyboard } from './useAdminEntriesKeyboard.js';

vi.mock('./AdminEntriesModel.js', () => ({ request: vi.fn() }));
vi.mock('@nennbox/contracts', () => ({
  EntryResponse: { parse: (value: unknown) => value },
}));
import { request } from './AdminEntriesModel.js';
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
function mount(element: React.ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const entry = {
  id: 'one',
  eventId: 'event',
  acceptanceStatus: 'submitted',
} as Entry;
const selected = vi.fn();
const refresh = vi.fn();
const error = vi.fn();
let api: ReturnType<typeof useEntryListStatusChanges>;
function Harness({ eventId = 'event', notify = false }) {
  const state = useEntryListStatusChanges({
    eventId,
    workflow: {
      statuses: [
        {
          key: 'submitted',
          labels: { de: 'Offen', en: 'Open' },
          category: 'pending',
          color: '',
        },
        {
          key: 'accepted',
          labels: { de: 'Zugelassen', en: 'Accepted' },
          category: 'accepted',
          color: '',
        },
      ],
      transitions: [
        { from: 'submitted', to: 'accepted', reasonRequired: true, notify },
        { from: 'accepted', to: 'submitted', reasonRequired: true },
      ],
    },
    setSelected: selected,
    setRefreshRevision: refresh,
    setActionError: error,
  });
  useEffect(() => {
    api = state;
  });
  return (
    state.notice && (
      <EntryStatusToast notice={state.notice} clear={state.clearNotice} />
    )
  );
}
it('submits the existing transition and offers a five-second safe inverse', async () => {
  vi.useFakeTimers();
  vi.mocked(request).mockImplementation(
    async () =>
      ({
        ok: true,
        json: async () => ({ ...entry, acceptanceStatus: 'accepted' }),
      }) as Response,
  );
  mount(<Harness />);
  await act(async () => api.changeStatus(entry, 'accepted'));
  expect(request).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Rückgängig');
  await act(async () =>
    (host.querySelector('button') as HTMLButtonElement).click(),
  );
  expect(
    JSON.parse(vi.mocked(request).mock.calls[1]![1]!.body as string).status,
  ).toBe('submitted');
  await act(async () => vi.advanceTimersByTime(5000));
  expect(host.querySelector('[role=status]')).toBeNull();
});
it('confirms notification side effects and never offers a misleading undo', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  mount(<Harness notify />);
  vi.mocked(request).mockClear();
  await act(async () => api.changeStatus(entry, 'accepted'));
  expect(confirm).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});
it('ignores a response after an event change', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(request).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  mount(<Harness />);
  let pending!: Promise<void>;
  act(() => {
    pending = api.changeStatus(entry, 'accepted');
  });
  act(() => root!.render(<Harness eventId="other" />));
  selected.mockClear();
  refresh.mockClear();
  await act(async () => {
    resolve({
      ok: true,
      json: async () => ({ ...entry, acceptanceStatus: 'accepted' }),
    } as Response);
    await pending;
  });
  expect(selected).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
it('separates selection, preview, double-click and row status interaction', () => {
  const preview = vi.fn();
  const detail = vi.fn();
  const select = vi.fn();
  const status = vi.fn();
  mount(
    <DataTable
      headers={['Nennung', 'Klasse', 'Status', 'Vollständigkeit', 'Aktionen']}
    >
      <EntryListRow
        name="Alex"
        vehicle="BMW"
        className="Sport"
        selectLabel="Alex auswählen"
        onOpen={preview}
        onOpenDetail={detail}
        onSelect={select}
        status={
          <EntryStatusMenu
            label="Offen"
            tone="offen"
            options={[{ key: 'accepted', label: 'Zulassen', tone: 'zu' }]}
            onChange={status}
          />
        }
      />
    </DataTable>,
  );
  act(() => host.querySelector<HTMLInputElement>('input')!.click());
  act(() =>
    host
      .querySelector('input')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
  );
  expect(detail).not.toHaveBeenCalled();
  expect(select).toHaveBeenCalledWith(true);
  expect(preview).not.toHaveBeenCalled();
  act(() =>
    host
      .querySelector('[role=menuitem]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  expect(status).toHaveBeenCalledWith('accepted');
  expect(preview).not.toHaveBeenCalled();
  act(() =>
    host.querySelector<HTMLTableRowElement>('.nb-entry-list-row')!.click(),
  );
  act(() =>
    host
      .querySelector('.nb-entry-list-row')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
  );
  expect(preview).toHaveBeenCalledOnce();
  expect(detail).toHaveBeenCalledOnce();
});
it('leaves preview navigation alone while a palette or status menu is open', () => {
  const close = vi.fn();
  const detail = vi.fn();
  function Keyboard() {
    useAdminEntriesKeyboard({
      items: [entry],
      selected: entry,
      isDetailOpen: false,
      openEntry: async () => {},
      openDetail: detail,
      closeDetail: vi.fn(),
      setSelected: close,
    });
    return (
      <EntryStatusMenu
        label="Offen"
        tone="offen"
        options={[{ key: 'accepted', label: 'Zulassen', tone: 'zu' }]}
        onChange={() => {}}
      />
    );
  }
  mount(<Keyboard />);
  act(() => {
    host.querySelector('details')!.open = true;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
  expect(host.querySelector('details')!.open).toBe(false);
  expect(close).not.toHaveBeenCalled();
  const dialog = document.createElement('dialog');
  dialog.open = true;
  document.body.append(dialog);
  act(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })),
  );
  expect(detail).not.toHaveBeenCalled();
  dialog.remove();
  act(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })),
  );
  expect(detail).toHaveBeenCalledOnce();
});
