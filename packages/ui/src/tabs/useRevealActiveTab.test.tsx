// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TabList } from './Tabs.js';

const tabs = [
  { id: 'all', label: 'Alle' },
  { id: 'open', label: 'Offen' },
  { id: 'shortlist', label: 'Vorauswahl' },
];
const reveal = vi.fn();
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reveal.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: function (this: HTMLElement, options: unknown) {
      reveal(this.textContent, options);
    },
  });
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});
const render = (selected: string) =>
  act(() =>
    root.render(
      <TabList
        label="Status"
        tabs={tabs}
        selected={selected}
        onChange={() => undefined}
      />,
    ),
  );

it('scrolls the selected tab into the visible area whenever the selection changes', () => {
  render('all');
  expect(reveal).toHaveBeenLastCalledWith('Alle', {
    inline: 'nearest',
    block: 'nearest',
  });
  render('shortlist');
  expect(reveal).toHaveBeenLastCalledWith('Vorauswahl', {
    inline: 'nearest',
    block: 'nearest',
  });
  const calls = reveal.mock.calls.length;
  render('shortlist');
  expect(reveal.mock.calls.length).toBe(calls);
});

it('works where scrollIntoView does not exist', () => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  expect(() => render('open')).not.toThrow();
});
