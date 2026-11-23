// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntryConfirmation } from './EntryConfirmation.js';
import { adminFetch } from '../../../auth.js';
import { exportsApi } from '../../exports/exportsApi.js';
vi.mock('../../../auth.js', () => ({ adminFetch: vi.fn() }));
vi.mock('../../exports/exportsApi.js', () => ({
  exportsApi: { status: vi.fn() },
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.mocked(adminFetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        jobId: '4d654219-e930-4989-9041-a4b17856d207',
        status: 'queued',
      }),
    ),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<EntryConfirmation eventId="event" groupId="group" />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const click = async (label: string) => {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  )!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
};
it('recovers a failed status request through explicit retry without creating a second PDF job', async () => {
  vi.mocked(exportsApi.status)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ status: 'running' } as Awaited<
      ReturnType<typeof exportsApi.status>
    >)
    .mockResolvedValueOnce({ status: 'finished' } as Awaited<
      ReturnType<typeof exportsApi.status>
    >);
  await click('PDF erstellen');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(host.textContent).toContain(
    'Der PDF-Status konnte nicht geladen werden.',
  );
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(exportsApi.status).toHaveBeenCalledTimes(1);
  await click('PDF-Status erneut laden');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(host.textContent).toContain('PDF wird erstellt');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(host.textContent).toContain('PDF herunterladen');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(adminFetch).toHaveBeenCalledTimes(1);
});
it('keeps status retry available after repeated network failures', async () => {
  vi.mocked(exportsApi.status).mockRejectedValue(new Error('offline'));
  await click('PDF erstellen');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  await click('PDF-Status erneut laden');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(
    [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'PDF-Status erneut laden',
    )?.disabled,
  ).toBe(false);
});
