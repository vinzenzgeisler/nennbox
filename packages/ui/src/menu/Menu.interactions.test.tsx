// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Menu, MenuItem } from './Menu.js';

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const action = vi.fn();
  act(() =>
    root.render(
      <Menu label="Aktionen">
        <MenuItem shortcut="Enter">Öffnen</MenuItem>
        <MenuItem disabled>Gesperrt</MenuItem>
        <MenuItem shortcut="M" onClick={action}>
          Nachricht
        </MenuItem>
      </Menu>,
    ),
  );
  return {
    action,
    summary: host.querySelector('summary')!,
    details: host.querySelector('details')!,
    buttons: host.querySelectorAll('button'),
  };
}
function key(target: Element, value: string) {
  act(() =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
it('opens with arrows, skips disabled items, wraps and returns focus on Escape', () => {
  const { summary, details, buttons } = mount();
  summary.focus();
  key(summary, 'ArrowDown');
  expect(details.open).toBe(true);
  expect(document.activeElement).toBe(buttons[0]);
  key(buttons[0]!, 'ArrowDown');
  expect(document.activeElement).toBe(buttons[2]);
  key(buttons[2]!, 'ArrowDown');
  expect(document.activeElement).toBe(buttons[0]);
  key(buttons[0]!, 'End');
  expect(document.activeElement).toBe(buttons[2]);
  key(buttons[2]!, 'Home');
  expect(document.activeElement).toBe(buttons[0]);
  key(buttons[0]!, 'Escape');
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});
it('supports menu shortcuts and closes before handing focus to the action', () => {
  const { summary, details, action } = mount();
  key(summary, 'ArrowDown');
  key(host.querySelector('button')!, 'm');
  expect(action).toHaveBeenCalledOnce();
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});
it('closes on outside pointer and Tab without trapping focus', () => {
  const { summary, details } = mount();
  key(summary, 'ArrowUp');
  act(() =>
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
  );
  expect(details.open).toBe(false);
  key(summary, 'ArrowDown');
  key(host.querySelector('button')!, 'Tab');
  expect(details.open).toBe(false);
});
