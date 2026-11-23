// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EntryResponse } from '@nennbox/contracts';
import { AdminApplication } from './AdminApplication.js';
import { AppButton } from '@nennbox/ui';

vi.mock('./AppShell.js', () => ({
  AppShell: (
    props: ComponentProps<typeof import('./AppShell.js').AppShell>,
  ) => (
    <>
      <AppButton
        onClick={() =>
          props.onEntrySelect?.({
            id: 'new-entry',
            eventId: 'new-event',
            adminDetails: { driver: { name: 'Neue Fahrerin' } },
          } as EntryResponse)
        }
      >
        Nennungstreffer
      </AppButton>
      <output>{props.entriesNavigationRevision}</output>
      {typeof props.children === 'function'
        ? props.children('setup')
        : props.children}
    </>
  ),
}));
vi.mock('../event-setup/EventSetup.js', () => ({
  EventSetup: (
    props: ComponentProps<
      typeof import('../event-setup/EventSetup.js').EventSetup
    >,
  ) => (
    <AppButton
      onClick={() =>
        props.onCreated({
          id: 'new-event',
          name: 'Neue Veranstaltung',
          slug: 'new-event',
          status: 'draft',
        } as Parameters<typeof props.onCreated>[0])
      }
    >
      Veranstaltung anlegen
    </AppButton>
  ),
}));
vi.mock('./useAdminIdentity.js', () => ({ useAdminIdentity: () => null }));

it('accepts palette entry hits immediately after creating an event', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([]));
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AdminApplication />));
    const button = (label: string) =>
      [...host.querySelectorAll('button')].find(
        (item) => item.textContent === label,
      )!;
    act(() => button('Veranstaltung anlegen').click());
    expect(host.querySelector('output')?.textContent).toBe('0');
    act(() => button('Nennungstreffer').click());
    expect(host.querySelector('output')?.textContent).toBe('1');
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
