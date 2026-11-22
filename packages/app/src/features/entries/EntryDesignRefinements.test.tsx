// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { DataTable, EntryListRow, PreviewPanel } from '@nennbox/ui';
import { AdminEntryFilters } from './AdminEntryFilters.js';
import { initialQuery } from './AdminEntriesModel.js';
import { EntryProperties } from './detail/EntryProperties.js';
import { EntryDetailHeader } from './detail/EntryDetailHeader.js';
import { EntryPreview } from '../shell/EntryPreview.js';
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  host.replaceChildren();
});
function mount(element: React.ReactNode) {
  root = createRoot(host);
  act(() => root.render(element));
}
const entry = {
  id: 'one',
  createdAt: '2026-04-12T16:12:00Z',
  acceptanceStatus: 'submitted',
  availableActions: ['note:internal'],
  adminDetails: {
    driver: { name: 'Thomas' },
    vehicle: { make: 'Honda', model: 'RS 250' },
    eventClass: { name: '250' },
    customAnswers: [],
  },
  statusProjection: {
    dimensions: [
      {
        key: 'entry',
        nextAction: { key: 'entry:accepted', label: { de: 'Zulassen' } },
        label: { de: 'Offen' },
      },
    ],
    hints: [],
  },
} as unknown as Entry;
it('keeps filter and sorting controls accessible behind compact buttons and retains values', () => {
  const changeSort = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState(initialQuery);
    return (
      <AdminEntryFilters
        draft={draft}
        setDraft={setDraft}
        changeSort={changeSort}
        classes={[{ id: '250', name: '250 ccm' }]}
      />
    );
  }
  mount(<Harness />);
  expect(host.querySelector('input')?.placeholder).toBe('In Nennungen suchen');
  const buttons = () => [...host.querySelectorAll('button')];
  const filter = buttons().find((b) => b.textContent === 'Filter')!;
  const panels = host.querySelectorAll<HTMLDivElement>(
    '.nb-entry-filter-options',
  );
  expect(panels[0]!.hidden).toBe(true);
  act(() => filter.click());
  expect(filter.getAttribute('aria-expanded')).toBe('true');
  const selects = host.querySelectorAll('select');
  act(() => {
    selects[0]!.value = '250';
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  act(() => {
    selects[1]!.value = 'paid';
    selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  act(() => filter.click());
  expect(selects[0]!.value).toBe('250');
  expect(selects[1]!.value).toBe('paid');
  expect(
    host.querySelector('[aria-label="Zahlungsfilter entfernen"]'),
  ).not.toBeNull();
  act(() =>
    (
      host.querySelector(
        '[aria-label="Klassenfilter entfernen"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(selects[0]!.value).toBe('');
  act(() =>
    buttons()
      .find((b) => b.textContent === 'Neueste zuerst')!
      .click(),
  );
  expect(panels[1]!.hidden).toBe(false);
  act(() => {
    selects[2]!.value = 'requestedStartNumber';
    selects[2]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(changeSort).toHaveBeenCalledWith('requestedStartNumber');
});
it('uses the vehicle sketch for missing images in list, preview and detail, but preserves real images', () => {
  const props = {
    name: 'Thomas',
    vehicle: 'Honda',
    className: '250',
    selectLabel: 'Auswählen',
    status: 'Offen',
  };
  const html = renderToStaticMarkup(
    <>
      <DataTable headers={['Nennung']}>
        <EntryListRow {...props} />
      </DataTable>
      <PreviewPanel title="Thomas" />
      <EntryDetailHeader entry={entry} actions={null} />
    </>,
  );
  expect(html.match(/aria-label="Kein Fahrzeugbild"/g)).toHaveLength(3);
  const real = renderToStaticMarkup(
    <PreviewPanel title="Thomas" imageUrl="/vehicle.jpg" imageAlt="Honda" />,
  );
  expect(real).toContain('src="/vehicle.jpg"');
  expect(real).not.toContain('Kein Fahrzeugbild');
});
it('offers admission and a document request side by side without the brand signal square', () => {
  const advance = vi.fn();
  const message = vi.fn();
  mount(
    <EntryPreview
      entry={entry}
      workflow={{
        statuses: [
          {
            key: 'accepted',
            category: 'accepted',
            labels: { de: 'Zugelassen', en: 'Accepted' },
            color: '',
          },
        ],
        transitions: [],
      }}
      onNextAction={advance}
      onClose={vi.fn()}
      onOpenDetail={vi.fn()}
      onMessage={message}
      busy={false}
    />,
  );
  const actions = host.querySelector('.nb-preview-action-row')!;
  expect(actions.textContent).toBe('ZulassenUnterlagen anfordern');
  expect(actions.querySelector('.nb-button-signal')).toBeNull();
  act(() => (actions.children[0] as HTMLButtonElement).click());
  act(() => (actions.children[1] as HTMLButtonElement).click());
  expect(advance).toHaveBeenCalledWith('accepted');
  expect(message).toHaveBeenCalledOnce();
});
it('renders the full Berlin arrival timestamp and retains an accessible internal-note field', () => {
  mount(
    <EntryProperties
      entry={entry}
      busy={false}
      saveNote={vi.fn()}
      onNumber={vi.fn()}
    />,
  );
  expect(host.textContent).toContain('12. Apr., 18:12');
  const textarea = host.querySelector('textarea')!;
  expect(
    host.querySelector(`#${textarea.getAttribute('aria-labelledby')}`)
      ?.textContent,
  ).toBe('Interne Notiz');
});
