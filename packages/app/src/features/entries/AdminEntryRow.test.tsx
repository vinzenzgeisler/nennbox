import { DataTable } from '@nennbox/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { AdminEntryRow } from './AdminEntryRow.js';
import type { WorkflowView } from './AdminEntriesModel.js';
const workflow = {
  statuses: [],
  transitions: [{ from: 'pending', to: 'accepted' }],
} as unknown as WorkflowView;
function markup(availableActions?: string[]) {
  const entry = {
    id: 'entry',
    acceptanceStatus: 'pending',
    availableActions,
  } as Entry;
  return renderToStaticMarkup(
    <DataTable headers={[]}>
      <AdminEntryRow
        entry={entry}
        eventId="event"
        selected={null}
        selectedIds={new Set()}
        setSelection={vi.fn()}
        classes={[]}
        workflow={workflow}
        openEntry={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    </DataTable>,
  );
}
it('fails closed until row status capabilities are hydrated', () => {
  expect(markup()).not.toContain('aria-label="Status ändern"');
  expect(markup([])).not.toContain('aria-label="Status ändern"');
  expect(markup(['acceptance:accepted'])).toContain(
    'aria-label="Status ändern"',
  );
});
it('resolves label, tone and transition targets through stable status ids', () => {
  const idWorkflow = {
    statuses: [
      { id: 'st-new', key: 'pending', category: 'open', labels: { de: 'Neu' } },
      {
        id: 'st-ok',
        key: 'accepted',
        category: 'accepted',
        labels: { de: 'Zugelassen' },
      },
    ],
    transitions: [{ from: 'st-new', to: 'st-ok' }],
  } as unknown as WorkflowView;
  const entry = {
    id: 'entry',
    acceptanceStatus: 'st-new',
    availableActions: ['acceptance:st-ok'],
  } as Entry;
  const html = renderToStaticMarkup(
    <DataTable headers={[]}>
      <AdminEntryRow
        entry={entry}
        eventId="event"
        selected={null}
        selectedIds={new Set()}
        setSelection={vi.fn()}
        classes={[]}
        workflow={idWorkflow}
        openEntry={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    </DataTable>,
  );
  expect(html).toContain('Neu');
  expect(html).toContain('Zugelassen');
  expect(html).not.toContain('st-new');
  expect(html).not.toContain('st-ok');
});
