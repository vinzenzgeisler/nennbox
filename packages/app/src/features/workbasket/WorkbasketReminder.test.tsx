// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkbasketReminder } from './WorkbasketReminder.js';
import { messagesApi } from '../messages/messagesApi.js';
import { freshRuleEntries } from './workbasketBulkApi.js';
vi.mock('./workbasketBulkApi.js', () => ({
  freshRuleEntries: vi.fn(),
  errorText: (error: Error) => error.message,
}));
const eventId = '10000000-0000-4000-8000-000000000001';
const entryId = '10000000-0000-4000-8000-000000000002';
const recipients = {
  count: 1,
  recipients: [{ entryId, name: 'Anja', email: 'anja@example.test' }],
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(freshRuleEntries).mockResolvedValue(new Set([entryId]));
  vi.spyOn(messagesApi, 'recipients').mockResolvedValue(recipients);
  vi.spyOn(messagesApi, 'render').mockResolvedValue({
    recipient: { name: 'Anja', email: 'anja@example.test' },
    subject: 'Unterlagen',
    text: 'Bitte ergänzen.',
  });
  vi.spyOn(messagesApi, 'send').mockResolvedValue({
    id: eventId,
    eventId,
    subject: 'Unterlagen',
    status: 'planned',
    createdAt: '',
    total: 1,
    sent: 0,
    failed: 0,
    recipients: [
      {
        id: entryId,
        entryId,
        email: 'anja@example.test',
        subject: 'Unterlagen',
        status: 'planned',
      },
    ],
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const click = async (label: string) => {
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  )!;
  expect(button).toBeDefined();
  await act(async () => button.click());
};
async function open(onDone = vi.fn()) {
  await act(async () =>
    root.render(
      <WorkbasketReminder
        eventId={eventId}
        ruleId="missingDocuments"
        entryIds={[entryId]}
        onDone={onDone}
      />,
    ),
  );
  await click('Unterlagen anfordern');
}
it('previews an explicit selection and only sends after count-based confirmation; queued is not sent', async () => {
  await open();
  expect(messagesApi.send).not.toHaveBeenCalled();
  await click('Vorschau erstellen');
  expect(document.body.textContent).toContain('anja@example.test');
  expect(document.body.textContent).toContain('Bitte ergänzen.');
  expect(messagesApi.send).not.toHaveBeenCalled();
  await click('Jetzt an 1 Empfänger senden');
  expect(messagesApi.send).toHaveBeenCalledWith(
    eventId,
    expect.objectContaining({
      recipients: expect.objectContaining({ entryIds: [entryId] }),
    }),
    expect.any(String),
  );
  expect(document.body.textContent).toContain('0 gesendet');
  expect(document.body.textContent).toContain('1 eingereiht');
});
it('does not turn an empty refreshed selection into a wildcard campaign', async () => {
  vi.mocked(freshRuleEntries).mockResolvedValue(new Set());
  await open();
  await click('Vorschau erstellen');
  expect(messagesApi.recipients).not.toHaveBeenCalled();
  expect(messagesApi.send).not.toHaveBeenCalled();
});
it('blocks changed recipients at confirmation', async () => {
  await open();
  await click('Vorschau erstellen');
  vi.mocked(messagesApi.recipients).mockResolvedValue({
    count: 0,
    recipients: [],
  });
  await click('Jetzt an 1 Empfänger senden');
  expect(messagesApi.send).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Empfänger haben sich geändert');
});
it('recovers an uncertain submission with the same idempotency key and immutable body even after closing', async () => {
  vi.mocked(messagesApi.send).mockRejectedValueOnce(
    new Error('Netzwerkfehler'),
  );
  await open();
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  const first = vi.mocked(messagesApi.send).mock.calls[0];
  await click('Schließen');
  await click('Unterlagen anfordern');
  await click('Versandauftrag erneut abrufen');
  expect(vi.mocked(messagesApi.send).mock.calls[1]).toEqual(first);
});

it('keeps confirmation usable under StrictMode effect replay', async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <WorkbasketReminder
          eventId={eventId}
          ruleId="paymentOpen"
          entryIds={[entryId]}
          onDone={vi.fn()}
        />
      </StrictMode>,
    ),
  );
  await click('Zahlungserinnerung vorbereiten');
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  expect(messagesApi.send).toHaveBeenCalledOnce();
  expect(messagesApi.send).toHaveBeenCalledWith(
    eventId,
    expect.objectContaining({
      recipients: expect.objectContaining({
        payment: 'any',
        entryIds: [entryId],
      }),
    }),
    expect.any(String),
  );
});

it('lets the user dismiss a sent campaign while its read-only status refresh is pending', async () => {
  const done = vi.fn();
  await open(done);
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  let finish!: (items: never[]) => void;
  vi.spyOn(messagesApi, 'campaigns').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await click('Versandstatus aktualisieren');
  await act(async () => {
    document
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
  });
  expect(done).toHaveBeenCalledOnce();
  await act(async () => finish([]));
  expect(messagesApi.send).toHaveBeenCalledOnce();
});
