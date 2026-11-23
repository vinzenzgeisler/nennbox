// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DriverPortalSettings } from './DriverPortalSettings.js';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('blocks fields and saves after a failed load, and recovers on a new event', async () => {
  const fetch = vi.fn(async (url: string) => ({
    ok: !url.includes('broken'),
    status: url.includes('broken') ? 503 : 200,
    json: async () => ({ fields: ['phone'] }),
  }));
  vi.stubGlobal('fetch', fetch);
  await act(async () =>
    root.render(<DriverPortalSettings eventId="broken" slug="broken" />),
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'nicht geladen',
  );
  const save = container.querySelector('button')!;
  expect(save.disabled).toBe(true);
  expect(
    [...container.querySelectorAll('input')].every((input) => input.disabled),
  ).toBe(true);
  await act(async () => save.click());
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(<DriverPortalSettings eventId="valid" slug="valid" />),
  );
  expect(container.querySelector('button')!.disabled).toBe(false);
  expect(container.querySelector('input')!.checked).toBe(true);
});

it('allows retrying a failed save with the successfully loaded fields intact', async () => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: init?.method !== 'PUT',
    status: init?.method === 'PUT' ? 503 : 200,
    json: async () => ({ fields: ['phone'] }),
  }));
  vi.stubGlobal('fetch', fetch);
  await act(async () =>
    root.render(<DriverPortalSettings eventId="valid" slug="valid" />),
  );
  await act(async () => container.querySelector('button')!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'nicht gespeichert',
  );
  expect(container.querySelector('button')!.disabled).toBe(false);
  expect(container.querySelector('input')!.checked).toBe(true);
  await act(async () => container.querySelector('button')!.click());
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === 'PUT'),
  ).toHaveLength(2);
});
