// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { NumberAndWaitlistSettings } from './NumberAndWaitlistSettings.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));

const json = (data: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
    }),
  );
let root: Root;
let container: HTMLDivElement;

const buttonByText = (text: string) =>
  [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(text),
  );

describe('numbers and waitlist settings', () => {
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
    vi.mocked(adminFetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/start-numbers') && !init?.method)
        return json({
          ranges: [
            {
              id: 'range-1',
              classId: 'class-1',
              from: 1,
              to: 9,
              reserved: [7],
              mode: 'automatic',
            },
          ],
          settings: { automaticPromotion: true, confirmationHours: 24 },
        });
      if (url.endsWith('/classes'))
        return json([{ id: 'class-1', name: 'Touring', maxParticipants: 12 }]);
      if (url.includes('/assign-all')) return json({ assigned: [{}, {}, {}] });
      return json({});
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<NumberAndWaitlistSettings eventId="event-1" />);
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists ranges and capacity as tables with one primary action', () => {
    expect(container.querySelectorAll('table')).toHaveLength(2);
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Von"]')
        ?.value,
    ).toBe('1');
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Kapazität Touring"]',
      )?.value,
    ).toBe('12');
    expect(buttonByText('Speichern')).toBeDefined();
    expect(container.textContent).not.toContain('Einstellungen speichern');
  });

  it('names the count and only assigns after confirmation', async () => {
    const assignCalls = () =>
      vi
        .mocked(adminFetch)
        .mock.calls.filter(([url]) => String(url).includes('/assign-all'));
    await act(async () =>
      buttonByText('Alle offenen Nummern vergeben')?.click(),
    );
    expect(assignCalls()).toHaveLength(1);
    expect(String(assignCalls()[0]?.[0])).toContain('dryRun=1');
    const dialog = container.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.textContent).toContain('3 offene Startnummern');

    await act(async () => buttonByText('3 Startnummern vergeben')?.click());
    expect(assignCalls()).toHaveLength(2);
    expect(String(assignCalls()[1]?.[0])).not.toContain('dryRun');
    expect(container.textContent).toContain('3 Startnummern vergeben.');
    const notice = container.querySelector('.nb-app-notice');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.className).toContain('nb-app-notice-info');
  });

  it('announces failures as alerts', async () => {
    vi.mocked(adminFetch).mockImplementation(async () => {
      throw new Error('offline');
    });
    await act(async () => buttonByText('Speichern')?.click());
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.className).toContain('nb-app-notice-error');
    expect(alert?.textContent).toContain('konnten nicht gespeichert werden');
  });
});
