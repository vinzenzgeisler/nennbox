// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { WorkspaceSplit } from './WorkspaceSplit.js';
import { clampPreviewWidth, PREVIEW_WIDTH_KEY } from './usePreviewResize.js';

it('clamps preview width to the minimum and half the workspace', () => {
  expect(clampPreviewWidth(100, 1200)).toBe(340);
  expect(clampPreviewWidth(900, 1200)).toBe(600);
  expect(clampPreviewWidth(400, 1200)).toBe(400);
});
it('restores width, supports separator keyboard resizing and persists it', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem(PREVIEW_WIDTH_KEY, '400');
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () =>
    root.render(<WorkspaceSplit preview={<p>Preview</p>}>List</WorkspaceSplit>),
  );
  const separator = container.querySelector('[role="separator"]')!;
  expect(separator.getAttribute('aria-valuenow')).toBe('400');
  await act(async () =>
    separator.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    ),
  );
  expect(separator.getAttribute('aria-valuenow')).toBe('420');
  expect(localStorage.getItem(PREVIEW_WIDTH_KEY)).toBe('420');
  await act(async () =>
    separator.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    ),
  );
  expect(separator.getAttribute('aria-valuenow')).toBe('340');
  // Pointer deltas stay anchored to pointerdown; repeated moves must not drift.
  const handle = separator as HTMLElement;
  handle.setPointerCapture = () => undefined;
  handle.releasePointerCapture = () => undefined;
  await act(async () =>
    handle.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 800, bubbles: true }),
    ),
  );
  await act(async () =>
    handle.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 780, bubbles: true }),
    ),
  );
  expect(separator.getAttribute('aria-valuenow')).toBe('360');
  await act(async () =>
    handle.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 780, bubbles: true }),
    ),
  );
  expect(separator.getAttribute('aria-valuenow')).toBe('360');
  await act(async () =>
    handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })),
  );
  await act(async () => root.unmount());
  localStorage.clear();
});
