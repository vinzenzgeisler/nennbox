// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette, type CommandItem } from './CommandPalette.js';

let container: HTMLDivElement;
let root: Root;
const workflow = vi.fn();
const entries = vi.fn();
const eventB = vi.fn();
const search = vi.fn();
const items: CommandItem[] = [
  {
    id: 'workflow',
    label: 'Nennungsablauf bearbeiten',
    detail: 'Status und Übergänge',
    icon: 'approval',
    group: 'Einstellungen',
    onSelect: workflow,
  },
  {
    id: 'entries',
    label: 'Nennungen',
    icon: 'list',
    group: 'Springen zu',
    onSelect: entries,
  },
  {
    id: 'switch',
    label: 'Veranstaltung wechseln',
    icon: 'switch',
    group: 'Springen zu',
    childrenPlaceholder: 'Veranstaltung suchen',
    children: [
      {
        id: 'event-b',
        label: 'Bergpreis 2027',
        icon: 'calendar',
        group: 'Veranstaltung wechseln',
        onSelect: eventB,
      },
    ],
  },
];

function Harness({ withSearch = false }: { withSearch?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        {...(withSearch
          ? {
              queryItems: (query: string) => [
                {
                  id: 'search',
                  label: `Nennungen nach „${query}“ suchen`,
                  icon: 'search' as const,
                  group: 'Springen zu',
                  onSelect: () => search(query),
                },
              ],
            }
          : {})}
      />
    </>
  );
}

const input = () =>
  container.querySelector<HTMLInputElement>('input[role="combobox"]');
const options = () => [
  ...container.querySelectorAll<HTMLElement>('[role="option"]'),
];
const activeLabel = () =>
  container.querySelector('[role="option"][aria-selected="true"]')?.textContent;
const key = async (target: Element, value: string, init = {}) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, ...init }),
    );
  });
const type = async (value: string) =>
  act(async () => {
    const field = input()!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
async function open(withSearch = false) {
  await act(async () => root.render(<Harness withSearch={withSearch} />));
  const opener = container.querySelector('button')!;
  opener.focus();
  await act(async () => opener.click());
  return opener;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('CommandPalette', () => {
  it('renders a labelled modal combobox with grouped options', async () => {
    await open();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Suchen und springen');
    const listbox = container.querySelector('[role="listbox"]')!;
    expect(input()!.getAttribute('aria-controls')).toBe(listbox.id);
    expect(
      [...container.querySelectorAll('[role="group"]')].map(
        (group) =>
          document.getElementById(group.getAttribute('aria-labelledby')!)
            ?.textContent,
      ),
    ).toEqual(['Einstellungen', 'Springen zu']);
    expect(options()).toHaveLength(3);
    expect(container.textContent).toContain(
      'Nennungen, Einstellungen und Aktionen',
    );
  });

  it('focuses the search and gives the focus back on Escape', async () => {
    const opener = await open();
    expect(document.activeElement).toBe(input());
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    await key(input()!, 'Escape');
    document.removeEventListener('keydown', outside);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    // The page's own Escape (e.g. closing the preview) must not fire as well.
    expect(outside).not.toHaveBeenCalled();
  });

  it('moves with the arrow keys and runs the active item with Enter', async () => {
    await open();
    expect(activeLabel()).toContain('Nennungsablauf bearbeiten');
    expect(input()!.getAttribute('aria-activedescendant')).toBe(
      options()[0]!.id,
    );
    await key(input()!, 'ArrowDown');
    await key(input()!, 'ArrowDown');
    await key(input()!, 'ArrowDown');
    expect(activeLabel()).toContain('Veranstaltung wechseln');
    await key(input()!, 'ArrowUp');
    expect(activeLabel()).toContain('Nennungen');
    await key(input()!, 'Enter');
    expect(entries).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('filters, highlights the match and resets the active item', async () => {
    await open();
    await key(input()!, 'ArrowDown');
    await type('ablauf');
    expect(options()).toHaveLength(1);
    expect(container.querySelector('mark')?.textContent).toBe('ablauf');
    expect(activeLabel()).toContain('Status und Übergänge');
    await type('xyz');
    expect(options()).toHaveLength(0);
    expect(container.textContent).toContain('Keine Treffer');
    await key(input()!, 'Enter');
    expect(workflow).not.toHaveBeenCalled();
  });

  it('opens a nested list and goes back with Backspace', async () => {
    await open();
    await act(async () => options()[2]!.click());
    expect(input()!.placeholder).toBe('Veranstaltung suchen');
    expect(options().map((option) => option.textContent)).toEqual([
      'Bergpreis 2027↵',
    ]);
    expect(document.activeElement).toBe(input());
    await key(input()!, 'Backspace');
    expect(options()).toHaveLength(3);
    await type('preis');
    await key(input()!, 'Enter');
    expect(eventB).toHaveBeenCalledOnce();
  });

  it('adds query items after the matches', async () => {
    await open(true);
    await type('Berger');
    expect(options().at(-1)?.textContent).toContain(
      'Nennungen nach „Berger“ suchen',
    );
    await key(input()!, 'Enter');
    expect(search).toHaveBeenCalledWith('Berger');
  });

  it('keeps Tab inside the dialog', async () => {
    await open();
    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Schließen"]',
    )!;
    close.focus();
    await key(close, 'Tab');
    expect(document.activeElement).toBe(input());
    await key(input()!, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it('closes on a click beside the dialog', async () => {
    await open();
    await act(async () => {
      container
        .querySelector('.nb-command-overlay')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
