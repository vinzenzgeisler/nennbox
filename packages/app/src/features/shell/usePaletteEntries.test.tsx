// @vitest-environment jsdom
import { Button } from '@nennbox/ui';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { usePaletteEntries } from './usePaletteEntries.js';
import { adminFetch } from '../../auth.js';
vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
vi.mock('@nennbox/contracts', () => ({
  AdminEntryListResponse: { parse: (value: unknown) => value },
}));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const select = vi.fn();
function Harness({ eventId = 'one', open = true }) {
  const commands = usePaletteEntries(open, eventId, select);
  return commands.map((command) => (
    <Button key={command.id} onClick={command.onSelect}>
      {command.label} {command.detail}
    </Button>
  ));
}
async function mount(open = true) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness open={open} />));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
const entry = {
  id: 'entry',
  eventId: 'one',
  requestedStartNumber: '42',
  adminDetails: {
    driver: { name: 'Alex' },
    vehicle: { make: 'BMW', model: '2002' },
    eventClass: { name: 'Touring' },
  },
};
it('does not fetch until the palette opens', async () => {
  await mount(false);
  expect(adminFetch).not.toHaveBeenCalled();
});
it('renders authenticated event-scoped entry hits and opens the selected record', async () => {
  vi.mocked(adminFetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [entry, { ...entry, id: 'foreign', eventId: 'two' }],
    }),
  } as Response);
  await mount();
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(host.textContent).toContain('Alex Nr. 42 · BMW · 2002');
  act(() => host.querySelector('button')!.click());
  expect(select).toHaveBeenCalledWith(entry);
  expect(vi.mocked(adminFetch).mock.calls[0]![0]).toContain('eventId=one');
});
it('does not retain hits when the event changes or access is denied', async () => {
  vi.mocked(adminFetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [entry] }),
    } as Response)
    .mockResolvedValueOnce({ ok: false } as Response);
  await mount();
  await act(async () => root.render(<Harness eventId="two" />));
  expect(host.querySelector('button')).toBeNull();
});
