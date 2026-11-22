// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { DataTable } from '@nennbox/ui';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { EntryProperties } from './detail/EntryProperties.js';
import { EntryDetailHeader } from './detail/EntryDetailHeader.js';
import { AdminEntryRow } from './AdminEntryRow.js';
import { EntryPreview } from '../shell/EntryPreview.js';
import { assignedNumber, numberWish } from './entryStartNumber.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount(element: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
}
const entry = {
  id: 'one',
  eventId: 'event',
  acceptanceStatus: 'submitted',
  requestedStartNumber: '42',
  assignedStartNumber: '77',
  startNumberStatus: 'assigned',
  createdAt: '2026-11-20T10:00:00Z',
  adminDetails: {
    driver: { name: 'Alex Test' },
    vehicle: { make: 'BMW', model: '2002' },
    eventClass: { name: 'Klasse 1' },
    // An older response might still echo the wish here.
    startNumber: '42',
    customAnswers: [],
    invoice: {
      status: 'paid',
      totalCents: 1000,
      paidCents: 1000,
      currency: 'EUR',
    },
  },
  statusProjection: {
    dimensions: [],
    hints: [
      {
        key: 'double_starter',
        present: true,
        relatedEntries: [
          { entryId: 'other', startNumber: '88' },
          { entryId: 'pending', startNumber: null },
        ],
      },
    ],
  },
} as unknown as Entry;
const properties = (
  selected: Entry,
  onOpenRelated?: (id: string) => Promise<void>,
) => (
  <EntryProperties
    entry={selected}
    busy={false}
    saveNote={vi.fn()}
    onNumber={vi.fn()}
    onOpenRelated={onOpenRelated}
  />
);
it('keeps allocation separate from a wish and does not trust the legacy echoed number', () => {
  expect(assignedNumber(entry)).toBe('77');
  expect(numberWish(entry)).toBe('42');
  expect(numberWish({ ...entry, requestedStartNumber: '77' })).toBeNull();
  expect(
    assignedNumber({ ...entry, startNumberStatus: 'requested' }),
  ).toBeNull();
  expect(
    assignedNumber({
      ...entry,
      assignedStartNumber: undefined,
      startNumberStatus: undefined,
    }),
  ).toBeNull();
  expect(assignedNumber({ ...entry, startNumberStatus: undefined })).toBe('77');
});
it('shows confirmed and wish separately in properties', () => {
  mount(properties(entry));
  expect(host.textContent).toContain('77 · bestätigt');
  expect(host.textContent).toContain('Wunsch: 42');
});
it.each([null, undefined])(
  'never manufactures a date for a historical paid invoice (%s)',
  (paidAt) => {
    mount(
      properties({
        ...entry,
        adminDetails: {
          ...entry.adminDetails!,
          invoice: { ...entry.adminDetails!.invoice!, paidAt },
        },
      }),
    );
    expect(host.textContent).not.toContain('Bezahlt am');
    expect(host.querySelector('time')).toBeNull();
  },
);
it('renders the real paid timestamp including Berlin-local time', () => {
  const paidAt = '2026-11-21T13:45:00Z';
  mount(
    properties({
      ...entry,
      adminDetails: {
        ...entry.adminDetails!,
        invoice: { ...entry.adminDetails!.invoice!, paidAt },
      },
    }),
  );
  expect(host.querySelector('time')?.dateTime).toBe(paidAt);
  expect(host.querySelector('time')?.textContent).toContain('14:45');
});
it('shows confirmed related numbers, identifies unallocated entries and uses supplied navigation', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  mount(properties(entry, open));
  const target = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Nr. 88',
  )!;
  await act(async () => target.click());
  expect(open).toHaveBeenCalledWith('other');
  expect(host.textContent).toContain('Weitere Nennung 2 (ohne Startnummer)');
});
it('keeps related references noninteractive without a supported route', () => {
  mount(properties(entry));
  expect(host.textContent).toContain('Doppelstarter · Nr. 88');
  expect(
    [...host.querySelectorAll('button')].some(
      (button) => button.textContent === 'Nr. 88',
    ),
  ).toBe(false);
});
it.each(['assigned', 'requested', 'legacy'] as const)(
  'list, detail and preview do not present a wish as assigned (%s)',
  (state) => {
    const selected = {
      ...entry,
      assignedStartNumber: state === 'assigned' ? '77' : undefined,
      startNumberStatus: state === 'legacy' ? undefined : state,
    };
    mount(
      <>
        <DataTable
          headers={[
            'Nennung',
            'Klasse',
            'Status',
            'Vollständigkeit',
            'Aktionen',
          ]}
        >
          <AdminEntryRow
            entry={selected}
            eventId="event"
            selected={null}
            selectedIds={new Set()}
            setSelection={vi.fn()}
            classes={[]}
            workflow={null}
            openEntry={vi.fn()}
            onChangeStatus={vi.fn()}
          />
        </DataTable>
        <EntryDetailHeader entry={selected} actions={null} />
        <EntryPreview
          entry={selected}
          workflow={null}
          onNextAction={vi.fn()}
          onClose={vi.fn()}
          onOpenDetail={vi.fn()}
          onMessage={vi.fn()}
          busy={false}
        />
      </>,
    );
    expect(host.textContent).not.toContain('Nr. 42');
    expect(host.textContent).toContain('Wunsch: 42');
    if (state === 'assigned') {
      expect(host.querySelector('.nb-entry-list-meta')?.textContent).toContain(
        'Nr. 77',
      );
      expect(host.querySelector('.nb-entry-identity')?.textContent).toContain(
        'Nr. 77',
      );
      expect(
        host.querySelector('.nb-preview-panel header')?.textContent,
      ).toContain('Nr. 77');
    } else {
      expect(host.textContent).not.toContain('Nr. 77');
    }
  },
);
