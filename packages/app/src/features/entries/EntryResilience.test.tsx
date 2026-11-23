// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminFetch, signIn } from '../../auth.js';
import { useAdminEntriesData } from './useAdminEntriesData.js';
import { initialQuery } from './AdminEntriesModel.js';
import { AdminEntryListStatus } from './AdminEntryListStatus.js';
import { EntryProperties } from './detail/EntryProperties.js';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { statusSteps } from './detail/EntryActionRail.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn(), signIn: vi.fn() }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let data: ReturnType<typeof useAdminEntriesData>;
let workflowResponse: () => Promise<Response>;
let listResponse: () => Promise<Response>;
const response = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const workflow = {
  statuses: [
    {
      key: 'accepted',
      labels: { de: 'Zugelassen', en: 'Accepted' },
      color: 'green',
      category: 'accepted',
    },
  ],
  transitions: [{ from: 'submitted', to: 'accepted', reasonRequired: false }],
};
const emptyList = { items: [], total: 0, totalPages: 0, page: 1, pageSize: 25 };
const setActionError = vi.fn();
function Harness({ eventId = 'event' }: { eventId?: string }) {
  const current = useAdminEntriesData({
    eventId,
    page: 1,
    pageSize: 25,
    applied: initialQuery,
    refreshRevision: 0,
    setActionError,
  });
  useEffect(() => {
    data = current;
  }, [current]);
  return (
    <AdminEntryListStatus
      apiState={current.apiState}
      total={current.total}
      workflowError={current.workflowError}
      onRetry={current.retryEntries}
      onRetryWorkflow={current.retryWorkflow}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  workflowResponse = () => response({ workflow });
  listResponse = () => response(emptyList);
  vi.mocked(adminFetch).mockImplementation((path) => {
    if (String(path).endsWith('registration-workflow'))
      return workflowResponse();
    if (String(path).startsWith('/admin/entries?')) return listResponse();
    return response([]);
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const mount = async (eventId = 'event') => {
  await act(async () => root.render(<Harness eventId={eventId} />));
};
const click = async (label: string) => {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  )!;
  await act(async () => button.click());
};
it.each([401, 403, 500, 'network', 'invalid'])(
  'keeps workflow null after %s and recovers only with a real successful load',
  async (failure) => {
    workflowResponse = () =>
      failure === 'network'
        ? Promise.reject(new Error('offline'))
        : response(
            failure === 'invalid' ? { workflow: {} } : {},
            typeof failure === 'number' ? failure : 200,
          );
    await mount();
    expect(data.workflow).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Statusaktionen',
    );
    expect(
      statusSteps(
        {
          acceptanceStatus: 'submitted',
          availableActions: ['acceptance:accepted'],
        } as Parameters<typeof statusSteps>[0],
        data.workflow,
      ).primary,
    ).toBeNull();
    workflowResponse = () => response({ workflow });
    await act(async () => data.retryWorkflow());
    expect(data.workflow).toEqual(workflow);
    expect(data.workflowError).toBeNull();
  },
);
it('clears the previous event workflow immediately while a new event is loading', async () => {
  await mount();
  workflowResponse = () => new Promise(() => {});
  await mount('other');
  expect(data.workflow).toBeNull();
});
it.each<number | 'network'>([401, 403, 500, 'network'])(
  'shows subsequent list error %s and offers recovery',
  async (failure) => {
    await mount();
    expect(data.apiState).toBe('ready');
    listResponse = () =>
      failure === 'network'
        ? Promise.reject(new Error('offline'))
        : response({}, failure);
    await act(async () => data.retryEntries());
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain('0 Nennungen');
    if (failure === 401) {
      vi.mocked(signIn).mockResolvedValue(undefined);
      await click('Erneut anmelden');
      expect(signIn).toHaveBeenCalledOnce();
    } else {
      listResponse = () => response(emptyList);
      await click('Erneut laden');
      expect(data.apiState).toBe('ready');
    }
  },
);
it('does not allow a late events response to hide a list failure', async () => {
  let resolveEvents!: (value: Response) => void;
  vi.mocked(adminFetch).mockImplementation((path) => {
    if (path === '/admin/events')
      return new Promise((resolve) => {
        resolveEvents = resolve;
      });
    if (String(path).endsWith('registration-workflow'))
      return response({ workflow });
    if (String(path).startsWith('/admin/entries?')) return response({}, 403);
    return response([]);
  });
  await mount();
  await act(async () => resolveEvents(new Response('[]')));
  expect(data.apiState).toBe('forbidden');
  expect(host.textContent).toContain('Zugriff verweigert');
});

it.each([
  undefined,
  { dimensions: [], hints: [{ key: 'passenger', present: false }] },
])(
  'omits both Hinweise cells when hints and number wishes are absent (%s)',
  async (projection) => {
    const entry = {
      createdAt: '2026-11-20T10:00:00Z',
      statusProjection: projection,
      availableActions: [],
    } as unknown as Entry;
    await act(async () =>
      root.render(
        <EntryProperties
          entry={entry}
          busy={false}
          saveNote={vi.fn()}
          onNumber={vi.fn()}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll('dt')].some(
        (term) => term.textContent === 'Hinweise',
      ),
    ).toBe(false);
    expect(host.querySelectorAll('dt')).toHaveLength(
      host.querySelectorAll('dd').length,
    );
  },
);
it('keeps Hinweise when only a start-number wish is present', async () => {
  const entry = {
    createdAt: '2026-11-20T10:00:00Z',
    requestedStartNumber: '42',
    availableActions: [],
  } as unknown as Entry;
  await act(async () =>
    root.render(
      <EntryProperties
        entry={entry}
        busy={false}
        saveNote={vi.fn()}
        onNumber={vi.fn()}
      />,
    ),
  );
  expect(host.textContent).toContain('Hinweise');
  expect(host.textContent).toContain('Wunsch: 42');
});
