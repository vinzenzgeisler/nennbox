// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { MessageRecipientFilterSchema } from '@nennbox/contracts';
import { MessageRecipients } from './MessageRecipients.js';
import { MessageComposer } from './MessageComposer.js';
import { MessageOutbox } from './MessageOutbox.js';
import { messagesApi } from './messagesApi.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

it('keeps recipient filters, individual selection and E2E group semantics', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  const preview = {
    count: 1,
    recipients: [
      { entryId: 'entry-1', name: 'Anja', email: 'anja@example.test' },
    ],
  };
  act(() =>
    root.render(
      <MessageRecipients
        filter={MessageRecipientFilterSchema.parse({})}
        onChange={onChange}
        classes={[]}
        candidates={preview}
        selection={preview}
        loading={false}
        search=""
        onSearch={vi.fn()}
        addresses=""
        onAddresses={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector('section[role=group]')?.textContent).toContain(
    'Empfänger',
  );
  expect(host.querySelector('[role=status]')?.textContent).toBe('1 Empfänger');
  const select = host.querySelectorAll('select')[1]!;
  act(() => {
    select.value = 'accepted';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ statuses: ['accepted'] }),
  );
  act(() =>
    host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click(),
  );
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ entryIds: ['entry-1'] }),
  );
  act(() => root.unmount());
});
it('applies templates and preserves PDF upload constraints', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSubject = vi.fn();
  const onText = vi.fn();
  act(() =>
    root.render(
      <MessageComposer
        eventId="event-1"
        templates={[
          {
            id: 'template-1',
            eventId: null,
            name: 'Unterlagen',
            subject: 'Bitte Unterlagen',
            textBody: 'Hallo {{firstName}}',
          },
        ]}
        subject=""
        text=""
        onSubject={onSubject}
        onText={onText}
        attachments={[]}
        onAttachments={vi.fn()}
      />,
    ),
  );
  const select = host.querySelector('select')!;
  act(() => {
    select.value = 'template-1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onSubject).toHaveBeenCalledWith('Bitte Unterlagen');
  expect(onText).toHaveBeenCalledWith('Hallo {{firstName}}');
  expect(host.querySelector('input[type=file]')?.getAttribute('accept')).toBe(
    'application/pdf,.pdf',
  );
  expect(host.querySelector('textarea')?.maxLength).toBe(50000);
  act(() => root.unmount());
});
it('retries failed messages, refreshes the outbox and renders relative times', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const retry = vi
    .spyOn(messagesApi, 'retry')
    .mockResolvedValue({
      id: 'campaign-1',
      eventId: 'event-1',
      subject: 'Unterlagen fehlen',
      status: 'planned',
      createdAt: new Date().toISOString(),
      total: 2,
      sent: 1,
      failed: 0,
      recipients: [],
    });
  const refresh = vi.fn();
  const createdAt = new Date(Date.now() - 60000).toISOString();
  act(() =>
    root.render(
      <MessageOutbox
        campaigns={[
          {
            id: 'campaign-1',
            eventId: 'event-1',
            subject: 'Unterlagen fehlen',
            status: 'failed',
            createdAt,
            total: 2,
            sent: 1,
            failed: 1,
            recipients: [],
          },
        ]}
        onChanged={refresh}
      />,
    ),
  );
  expect(host.querySelector('time')?.dateTime).toBe(createdAt);
  expect(host.querySelector('time')?.textContent).toContain('vor 1 Min.');
  const buttons = [...host.querySelectorAll('button')];
  await act(async () =>
    buttons
      .find((button) => button.textContent === 'Fehlgeschlagene erneut senden')!
      .click(),
  );
  expect(retry).toHaveBeenCalledWith('campaign-1');
  expect(refresh).toHaveBeenCalledOnce();
  act(() =>
    buttons
      .find((button) => button.textContent === 'Postausgang aktualisieren')!
      .click(),
  );
  expect(refresh).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  retry.mockRestore();
});
