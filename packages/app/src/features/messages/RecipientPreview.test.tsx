// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AdminMessages } from './AdminMessages.js';

vi.mock('./useMessagesData.js', () => ({
  useMessagesData: () => {
    const ready = (value: unknown) => ({ value, loading: false, error: '' });
    const recipients = Array.from({ length: 62 }, (_, i) => ({
      entryId: String(i),
      name: 'Person ' + i,
      email: i + '@example.test',
    }));
    return {
      selection: ready({ count: 62, recipients }),
      candidates: ready({ count: 0, recipients: [] }),
      classes: ready([]),
      templates: ready([]),
      campaigns: ready([]),
      rendered: ready(null),
    };
  },
}));
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
it('bounds a large recipient preview to eight quiet entries and the remaining count', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<AdminMessages eventId="event-1" />));
  const preview = host.querySelector(
    '[role="group"][aria-label="Empfängervorschau"]',
  )!;
  expect(preview.children).toHaveLength(8);
  expect(preview.querySelector('ul, li')).toBeNull();
  expect(preview.textContent).toContain('Person 0 · 0@example.test');
  expect(preview.textContent).not.toContain('Person 8');
  expect(preview.parentElement?.textContent).toContain('und 54 weitere');
  act(() => root.unmount());
});
