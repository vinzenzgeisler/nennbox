// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, APP_NAVIGATION_REGISTRY } from './AppShell.js';

describe('AppShell', () => {
  it('groups primary navigation by the app registry and switches events accessibly', async () => {
    const onEventChange = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell
          events={[{ id: 'event-1', name: 'Historischer Bergpreis' }]}
          activeEvent="event-1"
          onEventChange={onEventChange}
        >
          <p>Shell content</p>
        </AppShell>,
      ),
    );
    expect(APP_NAVIGATION_REGISTRY.map((group) => group.label)).toEqual([
      'Veranstaltung',
      'Kommunikation',
      'Konto',
    ]);
    expect(
      container.querySelector('[aria-label="Veranstaltung"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[aria-label="Nennungsablauf"]'),
    ).toBeTruthy();
    expect(container.querySelector('[aria-label="Nachrichten"]')?.tagName).toBe(
      'BUTTON',
    );
    const event = container.querySelector<HTMLSelectElement>('select')!;
    expect(event.closest('label')?.querySelector('span')?.className).toBe(
      'nb-visually-hidden',
    );
    await act(async () => {
      event.value = '';
      event.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onEventChange).toHaveBeenCalledWith('');
    expect(container.textContent).toContain('Shell content');
    await act(async () => root.unmount());
  });

  it('hides navigation without a real destination', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell>
          <p>Content</p>
        </AppShell>,
      ),
    );
    expect(container.querySelector('[aria-label="Rennbetrieb"]')).toBeNull();
    await act(async () => root.unmount());
  });
  it('closes the wide preview with Escape and keeps navigation keyboard focusable', async () => {
    const onClosePreview = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell onClosePreview={onClosePreview} previewOpen>
          <p>Content</p>
        </AppShell>,
      ),
    );
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(onClosePreview).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="Nennungen"]')?.tagName).toBe(
      'BUTTON',
    );
    await act(async () => root.unmount());
  });
  it('opens „Suchen und springen“ with ⌘K and routes a free-text entry search', async () => {
    const onEntrySearch = vi.fn();
    const onClosePreview = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell
          onEntrySearch={onEntrySearch}
          onClosePreview={onClosePreview}
          previewOpen
        >
          <p>Content</p>
        </AppShell>,
      ),
    );
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          bubbles: true,
        }),
      ),
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Suchen und springen"]',
    )!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'Mustermann');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain(
      'Nennungen nach „Mustermann“ suchen',
    );
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
    );
    expect(onEntrySearch).toHaveBeenCalledWith('Mustermann');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    // Escape inside the palette closes only the palette, not the preview.
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        }),
      ),
    );
    await act(async () =>
      container
        .querySelector('input[role="combobox"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onClosePreview).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
  it('jumps to a setting from the sidebar search', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(<AppShell>{(view) => <p>View {view}</p>}</AppShell>),
    );
    const search = container.querySelector<HTMLButtonElement>(
      '.nb-admin-nav-search',
    )!;
    expect(search.textContent).toContain('Strg K');
    search.focus();
    await act(async () => search.click());
    const option = [
      ...container.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((entry) =>
      entry.textContent?.includes('Nennungsablauf bearbeiten'),
    )!;
    await act(async () => option.click());
    expect(container.textContent).toContain('View workflow');
    expect(document.activeElement).toBe(search);
    await act(async () => root.unmount());
    container.remove();
  });
});

it.each([false, true])(
  'gates module navigation by confirmed permission (%s)',
  async (allowed) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <AppShell canManageModules={allowed}>
          {(view) => <p data-view={view}>View</p>}
        </AppShell>,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('.nb-admin-nav-search')!
        .click(),
    );
    const command = [
      ...container.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((button) => button.textContent?.includes('Module verwalten'));
    expect(Boolean(command)).toBe(allowed);
    if (command) {
      await act(async () => command.click());
      expect(
        container.querySelector('[data-view]')?.getAttribute('data-view'),
      ).toBe('modules');
    }
    await act(async () => root.unmount());
  },
);
