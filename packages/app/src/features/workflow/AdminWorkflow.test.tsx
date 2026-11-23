// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { AdminWorkflow, defaultWorkflow } from './AdminWorkflow.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const events = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
];
const revision = { id: 'rev-a', version: 2, workflow: defaultWorkflow };
async function render(eventId: string) {
  await act(async () =>
    root.render(<AdminWorkflow eventId={eventId} events={events} />),
  );
}
function setup() {
  vi.mocked(adminFetch).mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function input(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`,
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each([403, 500, 'network'] as const)(
  'clears the previous event draft and reason when loading fails (%s)',
  async (failure) => {
    setup();
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(revision)),
    );
    await render('a');
    input('Begründung für die Aktivierung', 'Only for A');
    let reject!: (reason: Error) => void;
    let resolve!: (response: Response) => void;
    vi.mocked(adminFetch).mockReturnValueOnce(
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      }),
    );
    await render('b');
    expect(host.textContent).toContain('wird geladen');
    await act(async () => {
      if (failure === 'network') reject(new Error('Connection failed'));
      else resolve(new Response('{}', { status: failure }));
    });
    expect(
      host.querySelector('[aria-label="Begründung für die Aktivierung"]'),
    ).toBeNull();
    expect(host.textContent).not.toContain('Aktive Version');
    expect(host.textContent).not.toContain('Ablauf prüfen und aktivieren');
    expect(host.textContent).toContain(
      failure === 403
        ? 'nicht ansehen'
        : failure === 500
          ? 'nicht geladen'
          : 'Connection failed',
    );
    vi.mocked(adminFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(revision)),
    );
    await render('a');
    expect(
      host.querySelector<HTMLInputElement>(
        '[aria-label="Begründung für die Aktivierung"]',
      )!.value,
    ).toBe('');
    expect(
      vi.mocked(adminFetch).mock.calls.every(([, init]) => !init?.method),
    ).toBe(true);
  },
);
it('keeps transition references fixed through duplicate and empty key edits, and saves stable IDs', async () => {
  setup();
  vi.mocked(adminFetch).mockResolvedValueOnce(
    new Response(JSON.stringify(revision)),
  );
  await render('a');
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Status 1 bearbeiten"]')!
      .click(),
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Übergang 1 bearbeiten"]')!
      .click(),
  );
  for (const key of ['accepted', '', 'submitted']) {
    input('Status 1 Schlüssel', key);
    expect(
      host.querySelector<HTMLSelectElement>('[aria-label="Übergang 1 von"]')!
        .value,
    ).toBe('pending');
    expect(
      host.querySelector<HTMLSelectElement>('[aria-label="Übergang 1 zu"]')!
        .value,
    ).toBe('accepted');
  }
  input('Begründung für die Aktivierung', 'Rename a display key');
  vi.mocked(adminFetch).mockResolvedValueOnce(
    new Response(JSON.stringify(revision)),
  );
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Ablauf prüfen und aktivieren')!
      .click(),
  );
  const body = JSON.parse(
    vi.mocked(adminFetch).mock.calls[1]![1]!.body as string,
  );
  expect(body.workflow.statuses[0]).toMatchObject({
    id: 'pending',
    key: 'submitted',
  });
  expect(body.workflow.transitions).toEqual(defaultWorkflow.transitions);
});
