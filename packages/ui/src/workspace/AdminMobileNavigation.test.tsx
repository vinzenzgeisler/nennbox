// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AdminNavigation } from './AdminNavigation.js';

it('keeps desktop names and all destinations, closes Mehr on navigation and opens search', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onNavigate = vi.fn();
  const onSearch = vi.fn();
  const labels = [
    'Übersicht',
    'Nennungen',
    'Einrichten',
    'Nachrichten',
    'Nennungsablauf',
    'Exporte',
    'Einstellungen',
  ];
  act(() =>
    root.render(
      <AdminNavigation
        brand="NENNBOX"
        ariaLabel="Navigation"
        eventLabel="Veranstaltung"
        eventPlaceholder="Wählen"
        events={[]}
        selectedEvent=""
        onEventChange={() => {}}
        groups={[
          {
            label: 'Veranstaltung',
            items: labels.map((label, index) => ({
              id: String(index),
              label,
              icon: 'list',
              mobile: index < 4,
            })),
          },
        ]}
        current="4"
        onNavigate={onNavigate}
        onSearch={onSearch}
        searchLabel="Suchen und springen"
      />,
    ),
  );
  try {
    const mobile = host.querySelector('.nb-admin-mobile-nav')!;
    expect(
      [...mobile.querySelectorAll('button')].map(
        (button) => button.textContent,
      ),
    ).toEqual([...labels, 'Suchen und springen']);
    const disclosure = mobile.querySelector('details')!;
    expect(disclosure.querySelector('summary')?.textContent).toBe('Mehr');
    expect(disclosure.querySelector('summary')?.className).toContain(
      'is-current',
    );
    disclosure.open = true;
    act(() =>
      [...mobile.querySelectorAll('button')]
        .find((button) => button.textContent === 'Nennungsablauf')!
        .click(),
    );
    expect(onNavigate).toHaveBeenCalledWith('4');
    expect(disclosure.open).toBe(false);
    disclosure.open = true;
    act(() =>
      [...mobile.querySelectorAll('button')]
        .find((button) => button.textContent === 'Suchen und springen')!
        .click(),
    );
    expect(onSearch).toHaveBeenCalledOnce();
    expect(disclosure.open).toBe(false);
    disclosure.open = true;
    act(() =>
      disclosure.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(disclosure.open).toBe(false);
    expect(document.activeElement).toBe(disclosure.querySelector('summary'));
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
