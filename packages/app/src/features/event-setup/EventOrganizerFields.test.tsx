// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventOrganizerFields } from './EventOrganizerFields.js';
import type { SetupDraft } from './eventSetupApi.js';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('shows the payment settings inside "Veranstalter und Zahlung", not in another section', async () => {
  await act(async () =>
    root.render(
      <EventOrganizerFields
        draft={{} as SetupDraft}
        setDraft={() => {}}
        busy={false}
        onClearRecipient={() => {}}
        paymentSettings={<p>Zahlungsarten-Marker</p>}
      />,
    ),
  );
  const organizer = host.querySelector('#event-setup-organizer');
  expect(organizer?.textContent).toContain('Zahlungsarten-Marker');
  expect(host.querySelector('#event-setup-arrival')?.textContent).not.toContain(
    'Zahlungsarten-Marker',
  );
});
