// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { DataTable } from '@nennbox/ui';
import { AdminEntryFilters } from './AdminEntryFilters.js';
import { AdminEntryRow } from './AdminEntryRow.js';
import { EntryDataHints } from './EntryDataHints.js';
import { initialQuery } from './AdminEntriesModel.js';

afterEach(() => document.body.replaceChildren());

const entry = {
  id: 'one',
  acceptanceStatus: 'submitted',
  requestedStartNumber: '42',
  assignedStartNumber: '77',
  startNumberStatus: 'assigned',
  adminDetails: {
    driver: { name: 'Thomas' },
    vehicle: { make: 'Honda', model: 'RS 250' },
    eventClass: { name: '250' },
  },
  waitlistPosition: 2,
  statusProjection: {
    hints: [
      { key: 'passenger', present: true },
      { key: 'late_registration', present: true },
      {
        key: 'double_starter',
        present: true,
        relatedEntries: [{ entryId: 'two', startNumber: '69' }],
      },
    ],
  },
} as unknown as Entry;

it.each([
  ['open', 'Offen'],
  ['partially_paid', 'Teilweise bezahlt'],
  ['paid', 'Bezahlt'],
  ['not_required', 'Nicht erforderlich'],
  ['not_relevant', 'Nicht relevant'],
])(
  'uses the same German payment label in badge and selector (%s)',
  (status, label) => {
    document.body.innerHTML = renderToStaticMarkup(
      <AdminEntryFilters
        draft={{ ...initialQuery, paymentStatus: status }}
        setDraft={vi.fn()}
        changeSort={vi.fn()}
        classes={[]}
      />,
    );
    expect(
      document.querySelector(`option[value="${status}"]`)?.textContent,
    ).toBe(label);
    expect(document.querySelector('.nb-active-filters')?.textContent).toContain(
      `Zahlung: ${label}`,
    );
  },
);

it('orders allocated number, wish and vehicle before a single compact hint', () => {
  document.body.innerHTML = renderToStaticMarkup(
    <DataTable headers={['Nennung']}>
      <AdminEntryRow
        entry={entry}
        eventId="event"
        selected={null}
        selectedIds={new Set()}
        setSelection={vi.fn()}
        classes={[]}
        workflow={null}
        openEntry={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    </DataTable>,
  );
  const metadata = document.querySelector('.nb-entry-list-meta')!;
  expect(metadata.textContent).toBe(
    'Nr. 77 · Wunsch: 42 · Honda RS 250Doppelstarter (auch Nr. 69)',
  );
  expect(metadata.querySelectorAll('.nb-hint')).toHaveLength(1);
});

it('uses passenger only without a present double starter and omits other compact hints', () => {
  const hints = entry.statusProjection!.hints.filter(
    (hint) => hint.key !== 'double_starter',
  );
  const selected = {
    ...entry,
    statusProjection: { ...entry.statusProjection!, hints },
  };
  expect(
    renderToStaticMarkup(<EntryDataHints entry={selected} compact />),
  ).toContain('mit Beifahrer');
  expect(
    renderToStaticMarkup(<EntryDataHints entry={selected} compact />),
  ).not.toContain('Wunsch');
  expect(
    renderToStaticMarkup(
      <EntryDataHints
        entry={{
          ...selected,
          statusProjection: {
            ...selected.statusProjection,
            hints: hints.filter((hint) => hint.key !== 'passenger'),
          },
        }}
        compact
      />,
    ),
  ).toBe('');
});
