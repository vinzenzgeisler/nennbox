import { afterEach, expect, it, vi } from 'vitest';
import { MessageRecipientFilterSchema } from '@nennbox/contracts';
import { messagesApi } from './messagesApi.js';

afterEach(() => vi.restoreAllMocks());

it('sends the visible filter in the API quick-action request envelope', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      Response.json(
        { error: 'No recipients', code: 'no-recipients' },
        { status: 422 },
      ),
    );
  const recipients = MessageRecipientFilterSchema.parse({
    classIds: ['10000000-0000-4000-8000-000000000001'],
    entryStatusIds: ['shortlist'],
  });
  await expect(
    messagesApi.quickAction('event', 'remind-open-payments', recipients),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledWith(
    '/admin/events/event/messages/actions/remind-open-payments',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ recipients }),
    }),
  );
});
