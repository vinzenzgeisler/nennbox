// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminMessages } from './AdminMessages.js';
import { messagesApi } from './messagesApi.js';

const state = vi.hoisted(() => ({ error: '' }));
vi.mock('./useMessagesData.js', () => ({
  useMessagesData: () => {
    const ready = (value: unknown) => ({
      value,
      loading: false,
      error: state.error,
    });
    const selection = ready({
      count: 1,
      recipients: [
        {
          entryId: '10000000-0000-4000-8000-000000000001',
          name: 'Anja',
          email: 'anja@example.test',
        },
      ],
    });
    return {
      selection,
      paymentSelection: selection,
      verificationSelection: selection,
      candidates: selection,
      classes: ready([]),
      workflow: ready([]),
      templates: ready([]),
      campaigns: ready([]),
      rendered: ready({
        recipient: { name: 'Anja', email: 'anja@example.test' },
        subject: 'Hallo',
        text: 'Text',
      }),
    };
  },
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sessionStorage.clear();
  state.error = '';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  )!;
const seed = {
  entryId: '10000000-0000-4000-8000-000000000001',
  subject: 'Hallo',
  body: 'Text',
};
it('confirms count, scope and recipients and forwards the visible selection after event changes', async () => {
  const send = vi
    .spyOn(messagesApi, 'quickAction')
    .mockResolvedValue({} as never);
  await act(async () =>
    root.render(<AdminMessages eventId="first" seed={seed} />),
  );
  await act(async () =>
    root.render(<AdminMessages eventId="second" seed={seed} />),
  );
  await act(async () => button('Offene Zahlungen erinnern').click());
  expect(document.querySelector('dialog')?.textContent).toContain(
    '1 Empfänger innerhalb der sichtbaren Empfängerfilter mit offener Zahlung',
  );
  expect(document.querySelector('dialog')?.textContent).toContain(
    'anja@example.test',
  );
  await act(async () => button('Jetzt senden').click());
  expect(send).toHaveBeenCalledWith(
    'second',
    'remind-open-payments',
    expect.objectContaining({
      entryIds: ['10000000-0000-4000-8000-000000000001'],
    }),
  );
  expect(host.textContent).toContain(
    'Nachricht wurde für den Versand eingeplant.',
  );
});
it('retains per-event drafts on view switches and warns before a real discard', async () => {
  await act(async () =>
    root.render(<AdminMessages eventId="first" seed={seed} />),
  );
  await act(async () => button('Vorname einfügen').click());
  await act(async () => root.render(<p>Andere Ansicht</p>));
  await act(async () => root.render(<AdminMessages eventId="second" />));
  expect(host.querySelector('textarea[rows="9"]')?.textContent).toBe('');
  await act(async () => root.render(<AdminMessages eventId="first" />));
  expect(host.querySelector('textarea[rows="9"]')?.textContent).toBe(
    'Text{{firstName}}',
  );
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await act(async () => button('Entwurf verwerfen').click());
  expect(confirm).toHaveBeenCalled();
  expect(host.querySelector('textarea[rows="9"]')?.textContent).toBe(
    'Text{{firstName}}',
  );
});
it('shows load errors and disables send actions instead of reporting an empty result', async () => {
  state.error = 'Laden fehlgeschlagen';
  await act(async () =>
    root.render(<AdminMessages eventId="first" seed={seed} />),
  );
  expect(host.textContent).toContain('Laden fehlgeschlagen');
  expect(button('Nachricht senden').disabled).toBe(true);
  expect(button('Offene Zahlungen erinnern').disabled).toBe(true);
  expect(host.textContent).not.toContain('0 Empfänger');
});
it('blocks sending while an attachment is uploading and includes it when complete', async () => {
  let finish!: (value: never) => void;
  vi.spyOn(messagesApi, 'upload').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const send = vi.spyOn(messagesApi, 'send').mockResolvedValue({} as never);
  await act(async () =>
    root.render(<AdminMessages eventId="first" seed={seed} />),
  );
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    value: [new File(['%PDF'], 'document.pdf', { type: 'application/pdf' })],
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(button('Nachricht senden').disabled).toBe(true);
  await act(async () =>
    finish({ objectId: 'pdf', filename: 'document.pdf', size: 4 } as never),
  );
  expect(button('Nachricht senden').disabled).toBe(false);
  await act(async () => button('Nachricht senden').click());
  await act(async () => button('Jetzt senden').click());
  expect(send).toHaveBeenCalledWith(
    'first',
    expect.objectContaining({
      attachments: [{ objectId: 'pdf', filename: 'document.pdf' }],
    }),
    expect.any(String),
  );
});
