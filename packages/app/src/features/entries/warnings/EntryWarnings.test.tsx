import { SessionPermissions } from '../../shell/SessionPermissions.js';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { AdminEntryList } from '../AdminEntryList.js';
import { initialQuery } from '../AdminEntriesModel.js';
import { EntryVehicleSection } from '../detail/EntryVehicleSection.js';
import { EntryDriverSection } from '../detail/EntryDriverSection.js';
import { EntryProperties } from '../detail/EntryProperties.js';
import { EntryWarnings } from './EntryWarnings.js';
import type { EntryWarning } from './entryWarnings.js';
vi.mock('./useEntryWarnings.js', () => ({ useEntryWarnings: vi.fn() }));
import { useEntryWarnings } from './useEntryWarnings.js';
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
const warning: EntryWarning = {
  ruleId: 'displacement',
  entryId: 'one',
  classId: 'class',
  reason: 'Server: Hubraum außerhalb der Klasse.',
  fields: ['displacementCc', 'maxDisplacementCc'],
  severity: 'warning',
};
it('shows server findings next to implicated vehicle, driver and start-number fields', () => {
  const vehicle = {
    make: 'BMW',
    model: '2002',
    displacementCc: 2000,
    year: 1970,
  };
  const vehicleHtml = renderToStaticMarkup(
    <EntryVehicleSection
      vehicle={vehicle as never}
      warnings={[warning]}
      busy={false}
      onSave={vi.fn()}
    />,
  );
  expect(vehicleHtml).toMatch(
    /Hubraum[\s\S]*2000 cm³[\s\S]*Server: Hubraum[\s\S]*Zylinder/,
  );
  const driverHtml = renderToStaticMarkup(
    <EntryDriverSection
      driver={{ name: 'Alex' } as never}
      passenger={null}
      busy={false}
      onSave={vi.fn()}
      warnings={[
        {
          ...warning,
          ruleId: 'expiredLicense',
          reason: 'Server: Lizenz abgelaufen',
          fields: ['licenseValidUntil'],
        },
      ]}
    />,
  );
  expect(driverHtml).toMatch(
    /Lizenznummer[\s\S]*Server: Lizenz abgelaufen[\s\S]*Telefon/,
  );
  const properties = renderToStaticMarkup(
    <EntryProperties
      entry={{ id: 'one', createdAt: '2026-01-01' } as Entry}
      busy={false}
      saveNote={vi.fn()}
      onNumber={vi.fn()}
      warnings={[
        {
          ...warning,
          ruleId: 'duplicateStartNumber',
          reason: 'Server: Nummer doppelt',
          fields: ['startNumber'],
        },
      ]}
    />,
  );
  expect(properties).toMatch(
    /Startnummer[\s\S]*Server: Nummer doppelt[\s\S]*Eingang/,
  );
});
it('does not invent warnings for suspicious entry values without API findings', () => {
  const html = renderToStaticMarkup(
    <EntryVehicleSection
      vehicle={
        { make: 'Test', model: 'Test', displacementCc: 99999, year: 1 } as never
      }
      busy={false}
      onSave={vi.fn()}
    />,
  );
  expect(html).not.toContain('Warnungen');
});
it('renders compact warning count with exact reason and evidence in its accessible tooltip', () => {
  const html = renderToStaticMarkup(
    <EntryWarnings warnings={[warning]} compact />,
  );
  expect(html).toContain('1 Warnung');
  expect(html).toContain('Server: Hubraum außerhalb der Klasse.');
  expect(html).toContain('Hubraum-Obergrenze');
});
it('filters the current list page without changing pagination or losing warning indicators', async () => {
  vi.mocked(useEntryWarnings).mockReturnValue({
    warnings: [warning],
    status: 'ready',
    retry: vi.fn(),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const items = ['one', 'two'].map((id) => ({
    id,
    eventId: 'event',
    acceptanceStatus: 'pending',
    adminDetails: {
      driver: { name: id },
      vehicle: { make: 'BMW', model: 'Test' },
      eventClass: { name: 'Klasse' },
    },
  })) as Entry[];
  act(() =>
    root.render(
      <AdminEntryList
        eventId="event"
        apiState="ready"
        draft={initialQuery}
        setDraft={vi.fn()}
        changeSort={vi.fn()}
        classes={[]}
        workflow={null}
        counts={{ pending: 2 }}
        total={2}
        items={items}
        selected={null}
        selectedIds={new Set()}
        setSelection={vi.fn()}
        openEntry={vi.fn()}
        onChangeStatus={vi.fn()}
        eligibleSelectedItems={[]}
        busy={false}
        clearSelection={vi.fn()}
        bulkAccept={vi.fn()}
        page={1}
        totalPages={2}
        setPage={vi.fn()}
      />,
    ),
  );
  expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(host.textContent).toContain('1 Warnung');
  const filter = Array.from(host.querySelectorAll('select')).find((select) =>
    select.textContent?.includes('Mit Warnungen'),
  )!;
  act(() => {
    filter.value = 'with';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(host.querySelector('tbody')!.textContent).toContain('one');
  act(() => {
    filter.value = 'without';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(host.querySelector('tbody')!.textContent).toContain('two');
  expect(host.textContent).toContain('Seite 1 von 2');
});
it('keeps driver edits limited to changed fields after adding inline findings', async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const save = vi.fn().mockResolvedValue({ ok: true });
  act(() =>
    root.render(
      <SessionPermissions.Provider value={['entry:write']}>
        <EntryDriverSection
          driver={
            {
              name: 'Alex Test',
              firstName: 'Alex',
              lastName: 'Test',
              phone: '111',
            } as never
          }
          passenger={null}
          busy={false}
          onSave={save}
          warnings={[]}
        />
      </SessionPermissions.Provider>,
    ),
  );
  act(() => host.querySelector('button')!.click());
  const phone = Array.from(host.querySelectorAll('input')).find(
    (input) => input.value === '111',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(phone, '222');
    phone.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith({ phone: '222' });
});
