// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest';
import { AdminEntries as AdminEntriesView } from './AdminEntries.js';
import { SessionPermissions } from './features/shell/SessionPermissions.js';
function AdminEntries(props: React.ComponentProps<typeof AdminEntriesView>) {
  return (
    <SessionPermissions.Provider
      value={['entry:write', 'payment:write', 'entry:inspect']}
    >
      <AdminEntriesView {...props} />
    </SessionPermissions.Provider>
  );
}
const eventA = '10000000-0000-4000-8000-000000000001';
const classA = '20000000-0000-4000-8000-000000000001';
const entryA = '30000000-0000-4000-8000-000000000001';
const orgId = '40000000-0000-4000-8000-000000000001';
const event = (id: string, name: string) => ({
  id,
  organizationId: orgId,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  name,
  startsOn: '2026-06-01',
  endsOn: '2026-06-01',
  status: 'open',
  registrationOpensAt: null,
  registrationClosesAt: null,
  openedAt: null,
  closedAt: null,
  archivedAt: null,
});
const entry = (id: string, eventId: string, classId: string) => ({
  id,
  organizationId: orgId,
  eventId,
  classId,
  registrationGroupId: '50000000-0000-4000-8000-000000000001',
  driverPersonId: '60000000-0000-4000-8000-000000000001',
  vehicleId: '70000000-0000-4000-8000-000000000001',
  verificationStatus: 'unverified',
  acceptanceStatus: 'pending',
  availableActions: [
    'acceptance:accepted',
    'acceptance:confirmed',
    'acceptance:rejected',
    'acceptance:withdrawn',
    'start_number',
    'message',
  ],
  requestedStartNumber: null,
  assignedStartNumber: id === entryA ? '42' : null,
  startNumberStatus: id === entryA ? 'assigned' : 'unassigned',
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  priceSnapshot: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  deletionReason: null,
  adminDetails: {
    driver: {
      name: id === entryA ? 'Alex Driver' : 'Casey Driver',
      firstName: id === entryA ? 'Alex' : 'Casey',
      lastName: 'Driver',
      dateOfBirth: '1990-01-01',
      country: 'DE',
      email: 'family@example.test',
      emailVerified: true,
    },
    vehicle: { make: 'Porsche', model: '911', year: 2020 },
    eventClass: { code: 'TOUR', name: 'Touring A' },
    startNumber: id === entryA ? '42' : null,
    customAnswers: [
      {
        key: 'club_name',
        label: 'Verein',
        value: 'MSC Beispielstadt',
        fileDownloadUrl: null,
      },
      {
        key: 'vehicle_photo',
        label: 'Fahrzeugbild',
        value: null,
        fileDownloadUrl: `/admin/events/${eventA}/registration-form-uploads/80000000-0000-4000-8000-000000000001`,
      },
    ],
  },
  statusProjection: {
    dimensions: [
      {
        key: 'entry',
        value: 'pending',
        label: { de: 'Offen', en: 'Pending' },
        meaning: 'new',
        required: true,
        nextAction: { key: 'accept', label: { de: 'Prüfen', en: 'Review' } },
      },
      {
        key: 'payment',
        value: 'open',
        label: { de: 'Offen', en: 'Open' },
        meaning: 'in_progress',
        required: true,
        nextAction: null,
      },
    ],
    documents: { complete: 1, total: 3 },
    hints: [],
  },
});

const detailActions = entry(entryA, eventA, classA).availableActions;
const rows = Array.from({ length: 13 }, (_, index) => ({
  ...entry(
    `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    eventA,
    classA,
  ),
  availableActions: [],
}));
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  await settle();
}
async function clickText(text: string) {
  const button = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
  await settle();
}
async function mount(
  options: {
    page?: number;
    failBoundary?: boolean;
    holdRefresh?: boolean;
  } = {},
) {
  let saved = false;
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/admin/events')
        return Response.json([event(eventA, 'Spring Rally')]);
      if (url.endsWith('/classes'))
        return Response.json([{ id: classA, name: 'Touring A' }]);
      if (url.endsWith('/start-number') && init?.method === 'PUT') {
        saved = true;
        return Response.json({ ok: true });
      }
      if (url.startsWith('/admin/entries?')) {
        const params = new URL(url, 'https://example.test').searchParams;
        const page = Number(params.get('page'));
        if (options.failBoundary && page === 2)
          return new Response('{}', { status: 503 });
        if (saved && options.holdRefresh)
          return new Promise<Response>(() => {});
        return Response.json({
          items: page === 1 ? rows.slice(0, 12) : rows.slice(12),
          page,
          pageSize: 12,
          total: 13,
          totalPages: 2,
        });
      }
      const row = rows.find((item) => url === `/admin/entries/${item.id}`);
      if (row) {
        const detail = { ...row, availableActions: detailActions };
        return Response.json(
          saved
            ? {
                ...detail,
                assignedStartNumber: '77',
                adminDetails: { ...row.adminDetails, startNumber: '77' },
              }
            : detail,
        );
      }
      return new Response('{}', { status: 404 });
    });
  window.history.replaceState(
    {},
    '',
    `/?eventId=${eventA}&page=${options.page ?? 1}&sort=requestedStartNumber&direction=asc&acceptanceStatus=pending&search=Driver`,
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<AdminEntries />));
  await settle();
  return fetchMock;
}
it('crosses both page edges and retains the chosen detail tab', async () => {
  const fetchMock = await mount();
  await click(`[data-entry-action="${rows[11]!.id}"]`);
  await clickText('Unterlagen');
  await click('[aria-label="Nächste Nennung"]');
  expect(window.location.search).toContain('page=2');
  expect(host.textContent).toContain('13 von 13');
  expect(
    host
      .querySelector('[aria-label="Nächste Nennung"]')
      ?.hasAttribute('disabled'),
  ).toBe(true);
  expect(
    host.querySelector('.nb-entry-page-tabs [aria-selected="true"]')
      ?.textContent,
  ).toContain('Unterlagen');
  const pageTwo = fetchMock.mock.calls
    .map(([url]) => String(url))
    .find(
      (url) => url.startsWith('/admin/entries?') && url.includes('page=2'),
    )!;
  const params = new URL(pageTwo, 'https://example.test').searchParams;
  expect(Object.fromEntries(params)).toMatchObject({
    eventId: eventA,
    pageSize: '12',
    sort: 'requestedStartNumber',
    direction: 'asc',
    acceptanceStatus: 'pending',
    search: 'Driver',
  });
  await click('[aria-label="Vorherige Nennung"]');
  expect(host.textContent).toContain('12 von 13');
  expect(
    host.querySelector('.nb-entry-page-tabs [aria-selected="true"]')
      ?.textContent,
  ).toContain('Unterlagen');
  await click('[aria-label="Vorherige Nennung"]');
  expect(host.textContent).toContain('11 von 13');
  expect(
    host.querySelector('.nb-entry-page-tabs [aria-selected="true"]')
      ?.textContent,
  ).toContain('Unterlagen');
});
it('keeps the current detail on a failed page request and allows retry', async () => {
  await mount({ failBoundary: true });
  await click(`[data-entry-action="${rows[11]!.id}"]`);
  await click('[aria-label="Nächste Nennung"]');
  expect(host.textContent).toContain('12 von 13');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'benachbarte Nennung',
  );
  expect(
    host
      .querySelector('[aria-label="Nächste Nennung"]')
      ?.hasAttribute('disabled'),
  ).toBe(false);
});
it('shows a saved start number in the list while its refresh is still pending', async () => {
  await mount({ holdRefresh: true });
  await click(`[data-entry-action="${rows[0]!.id}"]`);
  await clickText('42 · bestätigt');
  const input = host.querySelector<HTMLInputElement>('input[maxlength="16"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, '77');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await clickText('Nummer speichern');
  await clickText('‹ Nennungen');
  expect(host.querySelector('tbody tr')?.textContent).toContain('Nr. 77');
  expect(host.querySelector('tbody tr')?.textContent).not.toContain('Nr. 42');
});
