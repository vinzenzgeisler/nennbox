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
