// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { EntryStatusMenu } from '@nennbox/ui';
import { useAdminEntriesKeyboard } from './useAdminEntriesKeyboard.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const entries = ['first', 'middle', 'last'].map((id) => ({ id }) as Entry);
function mount(
  overrides: Partial<Parameters<typeof useAdminEntriesKeyboard>[0]> = {},
  menu = false,
) {
  const options = {
    items: entries,
    selected: entries[1]!,
    isDetailOpen: true,
    openEntry: vi
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    openDetail: vi.fn(),
    closeDetail: vi.fn(),
    setSelected: vi.fn(),
    ...overrides,
  };
  function Harness() {
    useAdminEntriesKeyboard(options);
    return (
      <>
        {menu && (
          <EntryStatusMenu
            label="Offen"
            tone="offen"
            options={[]}
            onChange={vi.fn()}
          />
        )}
      </>
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  return options;
}
function key(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document,
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it.each([
  ['ArrowDown', 'last'],
  ['j', 'last'],
  ['ArrowUp', 'first'],
  ['k', 'first'],
])('opens the adjacent detail with %s', (pressed, expected) => {
  const callbacks = mount();
  expect(key(pressed).defaultPrevented).toBe(true);
  expect(callbacks.openEntry).toHaveBeenCalledExactlyOnceWith(expected);
  expect(callbacks.openDetail).not.toHaveBeenCalled();
  expect(callbacks.setSelected).not.toHaveBeenCalled();
});

it.each([
  [0, 'ArrowUp'],
  [0, 'k'],
  [2, 'ArrowDown'],
  [2, 'j'],
])('does not wrap detail navigation at index %i using %s', (index, pressed) => {
  const callbacks = mount({ selected: entries[index]! });
  expect(key(pressed).defaultPrevented).toBe(false);
  expect(callbacks.openEntry).not.toHaveBeenCalled();
});

it.each([null, { id: 'outside' } as Entry])(
  'does not guess an adjacent entry without a listed selection',
  (selected) => {
    const callbacks = mount({ selected });
    key('ArrowDown');
    key('k');
    expect(callbacks.openEntry).not.toHaveBeenCalled();
  },
);

it('closes the detail on Escape without clearing selection or reopening it on Enter', () => {
  const callbacks = mount();
  key('Enter');
  key('Escape');
  expect(callbacks.closeDetail).toHaveBeenCalledOnce();
  expect(callbacks.openDetail).not.toHaveBeenCalled();
  expect(callbacks.setSelected).not.toHaveBeenCalled();
});

it.each(['input', 'select', 'textarea', 'div'])(
  'leaves keys in %s editors alone',
  (tag) => {
    const callbacks = mount();
    const editor = document.createElement(tag);
    if (tag === 'div')
      Object.defineProperty(editor, 'isContentEditable', { value: true });
    host.append(editor);
    key('j', {}, editor);
    key('Escape', {}, editor);
    expect(callbacks.openEntry).not.toHaveBeenCalled();
    expect(callbacks.closeDetail).not.toHaveBeenCalled();
  },
);

it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])(
  'ignores modified keys with %s',
  (modifier) => {
    const callbacks = mount();
    key('j', { [modifier]: true });
    key('Escape', { [modifier]: true });
    expect(callbacks.openEntry).not.toHaveBeenCalled();
    expect(callbacks.closeDetail).not.toHaveBeenCalled();
  },
);

it('honors keys already handled by another control', () => {
  const callbacks = mount();
  for (const pressed of ['j', 'Escape']) {
    const event = new KeyboardEvent('keydown', {
      key: pressed,
      cancelable: true,
    });
    event.preventDefault();
    act(() => {
      document.dispatchEvent(event);
    });
  }
  expect(callbacks.openEntry).not.toHaveBeenCalled();
  expect(callbacks.closeDetail).not.toHaveBeenCalled();
});

it.each(['dialog', 'role-dialog', 'details'])(
  'leaves navigation and Escape to an open %s',
  (kind) => {
    const callbacks = mount();
    const overlay = document.createElement(
      kind === 'role-dialog' ? 'div' : kind,
    );
    if (kind === 'role-dialog') overlay.setAttribute('role', 'dialog');
    else overlay.setAttribute('open', '');
    host.append(overlay);
    key('ArrowDown');
    key('Escape');
    expect(callbacks.openEntry).not.toHaveBeenCalled();
    expect(callbacks.closeDetail).not.toHaveBeenCalled();
    overlay.remove();
    key('Escape');
    expect(callbacks.closeDetail).toHaveBeenCalledOnce();
  },
);

it('dismisses a real status menu before Escape can leave the detail', () => {
  const callbacks = mount({}, true);
  const menu = host.querySelector('details')!;
  menu.open = true;
  key('Escape');
  expect(menu.open).toBe(false);
  expect(callbacks.closeDetail).not.toHaveBeenCalled();
  key('Escape');
  expect(callbacks.closeDetail).toHaveBeenCalledOnce();
});

it('keeps list arrows, Enter and Escape behavior separate from detail j/k navigation', () => {
  const callbacks = mount({ isDetailOpen: false });
  const rowClick = vi.fn();
  const row = document.createElement('button');
  row.dataset.entryAction = 'last';
  row.addEventListener('click', rowClick);
  host.append(row);
  key('j');
  key('k');
  expect(callbacks.openEntry).not.toHaveBeenCalled();
  expect(rowClick).not.toHaveBeenCalled();
  expect(key('ArrowDown').defaultPrevented).toBe(true);
  expect(rowClick).toHaveBeenCalledOnce();
  key('Enter');
  expect(callbacks.openDetail).toHaveBeenCalledOnce();
  key('Escape');
  expect(callbacks.setSelected).toHaveBeenCalledExactlyOnceWith(null);
  expect(callbacks.closeDetail).not.toHaveBeenCalled();
});

it('removes its document listener on unmount', () => {
  const callbacks = mount();
  act(() => root!.unmount());
  root = undefined;
  key('j');
  key('Escape');
  expect(callbacks.openEntry).not.toHaveBeenCalled();
  expect(callbacks.closeDetail).not.toHaveBeenCalled();
});
