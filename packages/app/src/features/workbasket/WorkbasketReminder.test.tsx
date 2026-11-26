// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkbasketBulkActions } from './WorkbasketBulkActions.js';
import { WorkbasketReminder } from './WorkbasketReminder.js';
import { MessageApiError, messagesApi } from '../messages/messagesApi.js';
import { freshRuleEntries } from './workbasketBulkApi.js';
vi.mock('../shell/SessionPermissions.js', () => ({
  useSessionPermission: () => true,
}));
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
  sessionStorage.clear();
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
    (item) => item.textContent?.replace(/ \(\d+\)$/, '') === label,
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

it('review: retains uncertain campaign identity when another workbasket task changes', async () => {
  vi.mocked(messagesApi.send).mockRejectedValue(
    new Error('response lost after server accepted'),
  );
  const render = async (ids: string[]) =>
    act(async () =>
      root.render(
        <WorkbasketBulkActions
          eventId={eventId}
          ruleId="missingDocuments"
          entryIds={ids}
          onDone={vi.fn()}
        />,
      ),
    );
  await render([entryId]);
  await click('Unterlagen anfordern');
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  const first = vi.mocked(messagesApi.send).mock.calls[0];
  await click('Schließen');
  // Reload after close receives an additional task for another entry; original entry remains eligible.
  await render([entryId, '10000000-0000-4000-8000-000000000003']);
  await click('Unterlagen anfordern');
  await click('Versandauftrag erneut abrufen');
  expect(vi.mocked(messagesApi.send).mock.calls[1]).toEqual(first);
});

it('restores the exact body and key after navigation, even when current tasks are empty', async () => {
  vi.mocked(messagesApi.send).mockRejectedValueOnce(new Error('Response lost'));
  await open();
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  const first = JSON.parse(
    JSON.stringify(vi.mocked(messagesApi.send).mock.calls[0]),
  );
  const stored = JSON.parse(
    sessionStorage.getItem(
      `nennbox:workbasket-reminder:v1:${eventId}:missingDocuments`,
    )!,
  );
  expect(stored).toMatchObject({
    status: 'uncertain',
    key: first[2],
    body: first[1],
  });
  await act(async () => root.render(null));
  vi.mocked(freshRuleEntries).mockResolvedValue(new Set());
  vi.mocked(messagesApi.recipients).mockResolvedValue({
    count: 0,
    recipients: [],
  });
  await act(async () =>
    root.render(
      <WorkbasketBulkActions
        eventId={eventId}
        ruleId="missingDocuments"
        entryIds={[]}
        onDone={vi.fn()}
      />,
    ),
  );
  await click('Unterlagen anfordern');
  expect(document.querySelector('input')!.disabled).toBe(true);
  expect(
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent === 'Vorschau erstellen',
    ),
  ).toBe(false);
  await click('Versandauftrag erneut abrufen');
  expect(vi.mocked(messagesApi.send).mock.calls[1]).toEqual(first);
  expect(freshRuleEntries).toHaveBeenCalledTimes(2);
  expect(messagesApi.recipients).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).toContain('1 eingereiht');
});

it('persists before POST and restores a known campaign until explicit dismissal', async () => {
  const send = vi.mocked(messagesApi.send).getMockImplementation()!;
  vi.mocked(messagesApi.send).mockImplementation(async (...args) => {
    const stored = JSON.parse(
      sessionStorage.getItem(
        `nennbox:workbasket-reminder:v1:${eventId}:missingDocuments`,
      )!,
    );
    expect(stored).toMatchObject({
      status: 'uncertain',
      key: args[2],
      body: args[1],
    });
    return send(...args);
  });
  await open();
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  await act(async () => root.render(null));
  await open();
  expect(document.body.textContent).toContain('1 eingereiht');
  expect(messagesApi.send).toHaveBeenCalledOnce();
  await click('Fertig');
  expect(
    sessionStorage.getItem(
      `nennbox:workbasket-reminder:v1:${eventId}:missingDocuments`,
    ),
  ).toBeNull();
});

it('isolates recovery by event and rule', async () => {
  vi.mocked(messagesApi.send).mockRejectedValue(new Error('Response lost'));
  await open();
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  await act(async () => root.render(null));
  for (const props of [
    { eventId, ruleId: 'paymentOpen' },
    { eventId: entryId, ruleId: 'missingDocuments' },
  ] as const) {
    await act(async () =>
      root.render(
        <WorkbasketBulkActions
          {...props}
          entryIds={[entryId]}
          onDone={vi.fn()}
        />,
      ),
    );
    await click(
      props.ruleId === 'paymentOpen'
        ? 'Zahlungserinnerung vorbereiten'
        : 'Unterlagen anfordern',
    );
    expect(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === 'Vorschau erstellen',
      ),
    ).toBe(true);
    expect(document.body.textContent).not.toContain(
      'Versandauftrag erneut abrufen',
    );
  }
  expect(messagesApi.send).toHaveBeenCalledOnce();
});

it('does not send if durable storage cannot be written', async () => {
  await open();
  await click('Vorschau erstellen');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Speicher voll');
  });
  await click('Jetzt an 1 Empfänger senden');
  expect(messagesApi.send).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Speicher voll');
});

it('blocks fresh sends when stored recovery is corrupt', async () => {
  sessionStorage.setItem(
    `nennbox:workbasket-reminder:v1:${eventId}:missingDocuments`,
    '{invalid',
  );
  await open();
  expect(document.body.textContent).toContain('kein neuer Versand möglich');
  await click('Vorschau erstellen');
  expect(messagesApi.recipients).not.toHaveBeenCalled();
  expect(messagesApi.send).not.toHaveBeenCalled();
});

it('does not resurrect dismissed recovery when a pending status refresh resolves', async () => {
  await open();
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  const campaign = await vi.mocked(messagesApi.send).mock.results[0]!.value;
  let finish!: (items: (typeof campaign)[]) => void;
  vi.spyOn(messagesApi, 'campaigns').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await click('Versandstatus aktualisieren');
  await click('Fertig');
  await act(async () => finish([campaign]));
  expect(
    sessionStorage.getItem(
      `nennbox:workbasket-reminder:v1:${eventId}:missingDocuments`,
    ),
  ).toBeNull();
});

it('allows a new explicit preview after the server definitively rejects confirmation drift', async () => {
  vi.mocked(messagesApi.send).mockRejectedValueOnce(
    new MessageApiError('Bitte neu bestätigen.', [], 'confirmation-changed'),
  );
  await open();
  await click('Vorschau erstellen');
  await click('Jetzt an 1 Empfänger senden');
  const previousKey = vi.mocked(messagesApi.send).mock.calls[0]![2];
  expect(document.body.textContent).not.toContain(
    'Versandauftrag erneut abrufen',
  );
  expect(document.body.textContent).toContain('Bitte neu bestätigen.');
  expect(sessionStorage.length).toBe(0);
  await click('Vorschau erstellen');
  expect(messagesApi.send).toHaveBeenCalledTimes(1);
  await click('Jetzt an 1 Empfänger senden');
  expect(vi.mocked(messagesApi.send).mock.calls[1]![2]).not.toBe(previousKey);
});

it('shows counts and explains why a new reminder cannot be prepared', async () => {
  for (const [ruleId, reason] of [
    ['paymentOpen', 'Keine offenen Zahlungen vor Nennschluss.'],
    ['missingDocuments', 'Keine überfälligen Unterlagen anzufordern.'],
  ] as const) {
    await act(async () =>
      root.render(
        <WorkbasketReminder
          eventId={eventId}
          ruleId={ruleId}
          entryIds={[]}
          onDone={vi.fn()}
        />,
      ),
    );
    const button = host.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('(0)');
    expect(host.textContent).toContain(reason);
    expect(messagesApi.send).not.toHaveBeenCalled();
  }
});
