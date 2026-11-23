// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminEntryFilters } from './AdminEntryFilters.js';
import { initialQuery, type EntryQuery } from './AdminEntriesModel.js';

afterEach(() => vi.unstubAllGlobals());

it('names the drilldown filters from the overview and removes them again', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let query: EntryQuery = initialQuery;
  function Harness() {
    const [draft, setDraft] = useState<EntryQuery>({
      ...initialQuery,
      paymentStatus: 'outstanding',
      missingDocuments: 'true',
    });
    query = draft;
    return (
      <AdminEntryFilters
        draft={draft}
        setDraft={setDraft}
        changeSort={() => undefined}
        classes={[]}
      />
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Harness />));
  try {
    expect(host.textContent).toContain('Zahlung: Offen oder teilweise bezahlt');
    expect(host.textContent).toContain('Unterlagen fehlen');
    const remove = [...host.querySelectorAll('button')].find(
      (button) =>
        button.getAttribute('aria-label') ===
        'Filter fehlende Unterlagen entfernen',
    );
    expect(remove).toBeDefined();
    act(() => remove!.click());
    expect(query.missingDocuments).toBe('');
    expect(query.paymentStatus).toBe('outstanding');
    expect(host.textContent).not.toContain('Unterlagen fehlen');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
