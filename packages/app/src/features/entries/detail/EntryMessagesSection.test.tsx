// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { EntryMessagesSection } from './EntryMessagesSection.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
function mount(onWrite?: () => void) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <EntryMessagesSection messages={[]} failed={false} onWrite={onWrite} />,
    ),
  );
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it('offers writing a message from the tab when the user may write one', () => {
  const onWrite = vi.fn();
  mount(onWrite);
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === 'Nachricht schreiben',
  );
  act(() => button!.click());
  expect(onWrite).toHaveBeenCalledOnce();
});

it('shows no write action without permission', () => {
  mount();
  expect(host.querySelector('button')).toBeNull();
  expect(host.textContent).toContain('noch keine E-Mails');
});
