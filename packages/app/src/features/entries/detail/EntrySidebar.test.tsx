// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { AdminEntryDetail } from '../AdminEntryDetail.js';
import { EntryProperties } from './EntryProperties.js';
import { EntryRecentNote } from './EntryRecentNote.js';

const history = (
  id: string,
  label: string,
  occurredAt: string,
  detail: string,
) => ({
  id,
  kind: 'entry' as const,
  label,
  occurredAt,
  detail,
  actor: 'Nennbüro',
});
const entry = {
  id: 'entry',
  eventId: 'event',
  createdAt: '2026-04-12T16:12:00Z',
  acceptanceStatus: 'submitted',
  verificationStatus: 'verified',
  availableActions: ['note:internal', 'message'],
  adminDetails: {
    driver: {
      name: 'Thomas Berger',
      firstName: 'Thomas',
      lastName: 'Berger',
      email: 'thomas@example.test',
    },
    vehicle: { make: 'Honda', model: 'RS 250' },
    eventClass: { name: '250' },
    customAnswers: [],
  },
  adminHistory: [
    history(
      'old',
      'internal_note',
      '2026-04-13T08:00:00Z',
      'Ältere interne Notiz',
    ),
    history('driver', 'driver_note', '2026-04-16T08:00:00Z', 'Nicht intern'),
    history(
      'latest',
      'internal_note',
      '2026-04-15T08:00:00Z',
      'Rückruf vereinbart',
    ),
    history('empty', 'internal_note', '2026-04-17T08:00:00Z', ' '),
  ],
} as unknown as Entry;
function markup(element: React.ReactNode) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}
it('keeps checklist, available actions, properties and latest note in the detail sidebar', () => {
  const host = markup(
    <AdminEntryDetail
      selected={entry}
      classes={[]}
      workflow={null}
      busy={false}
      error=""
      transition={vi.fn()}
      onBack={vi.fn()}
      onUpdated={vi.fn()}
      onMessage={vi.fn()}
    />,
  );
  const sidebar = host.querySelector('.nb-entry-page-sidebar')!;
  expect(sidebar.querySelector('.nb-admission-progress')).not.toBeNull();
  expect(
    sidebar.querySelector('[aria-label="Aktionen"]')?.textContent,
  ).toContain('Nachricht schreiben');
  expect(sidebar.querySelector('.nb-entry-properties')?.textContent).toContain(
    'Eigenschaften',
  );
  expect(sidebar.querySelector('.nb-entry-recent-note')?.textContent).toContain(
    'Rückruf vereinbart',
  );
  expect(sidebar.querySelector('textarea')).not.toBeNull();
  expect(
    host.querySelector('.nb-entry-page-head .nb-admission-progress'),
  ).toBeNull();
  const columns = host.querySelector('.nb-entry-overview-columns')!;
  expect(
    [...columns.children].map(
      (child) => child.querySelector('h3')?.textContent,
    ),
  ).toEqual(['Fahrer', 'Fahrzeug']);
});
it('uses the latest nonempty internal note, independent of history ordering', () => {
  const host = markup(<EntryRecentNote entry={entry} />);
  expect(host.textContent).toContain('Rückruf vereinbart');
  expect(host.textContent).not.toContain('Ältere interne Notiz');
  expect(host.textContent).not.toContain('Nicht intern');
  expect(host.querySelector('time')?.dateTime).toBe('2026-04-15T08:00:00Z');
  expect(host.textContent).toContain('Nennbüro');
});
it('hides an empty note preview and preserves saved notes without write permission', () => {
  expect(
    renderToStaticMarkup(
      <EntryRecentNote entry={{ ...entry, adminHistory: [] }} />,
    ),
  ).toBe('');
  const host = markup(
    <EntryProperties
      entry={{ ...entry, availableActions: [] }}
      busy={false}
      saveNote={vi.fn()}
      onNumber={vi.fn()}
    />,
  );
  expect(host.querySelector('.nb-entry-recent-note')?.textContent).toContain(
    'Rückruf vereinbart',
  );
  expect(host.querySelector('textarea')).toBeNull();
});
