import { describe, expect, it, vi } from 'vitest';
import {
  sendMessageCampaign,
  type MessageCampaignRecipient,
  type MessageCampaignTransaction,
} from './message-campaign-send.js';
import type { MessageCampaignCreate } from './messages.js';
import { createRequestContext, organizationId } from './context.js';

const recipient = (
  entryId: string,
  email: string,
): MessageCampaignRecipient => ({
  entryId,
  email,
  registrationGroupId: 'group',
  firstName: 'Ada',
  lastName: 'Test',
  fullName: 'Ada Test',
  eventName: 'Test',
  className: 'Open',
  entryNumber: '1',
});
const first = recipient('entry-a', 'one@example.test');
const context = createRequestContext({
  deploymentMode: 'community',
  organizationId: organizationId('org'),
  permissions: new Set(),
  capabilities: new Set(),
  correlationId: 'confirmation-test',
});
function harness(resolved = [first], eligible = ['entry-a', 'entry-b']) {
  const input: MessageCampaignCreate = {
    eventId: 'event',
    recipients: {
      classIds: [],
      statuses: [],
      payment: 'any',
      entryIds: ['entry-a', 'entry-b'],
      additionalAddresses: [],
    },
    subject: 'Reminder',
    text: 'Body',
    attachments: [],
    workbasketConfirmation: {
      ruleId: 'paymentOpen',
      recipients: [{ entryId: first.entryId, email: first.email }],
    },
  };
  const tx: MessageCampaignTransaction<{ id: string }, { id: string }> = {
    resolveRecipients: vi.fn(async () => resolved),
    eligibleWorkbasketEntries: vi.fn(async () => eligible),
    findByIdempotencyKey: vi.fn(async () => null),
    createCampaign: vi.fn(async () => ({ id: 'campaign' })),
    recordAudit: vi.fn(async () => {}),
    enqueueRecipient: vi.fn(async () => ({ id: 'recipient' })),
    enqueueVerificationRecipient: vi.fn(async () => ({ id: 'recipient' })),
    getLocale: async () => 'de',
    markSending: async (c) => c,
    listRecipients: async () => [{ id: 'recipient' }],
  };
  const send = () =>
    sendMessageCampaign(context, 'event', 'same-key', input, 'actor', {
      maxAttachments: 5,
      validateAttachments: async () => ({ ok: true }),
      hashRequest: (s) => s,
      transaction: async (_ctx, work) => work(tx),
    });
  return { input, tx, send };
}
describe('authoritative campaign confirmation', () => {
  it.each([
    [
      'shared address splits into two recipients',
      [first, recipient('entry-b', 'two@example.test')],
    ],
    [
      'same count but replacement email',
      [recipient('entry-a', 'changed@example.test')],
    ],
    [
      'same email but replacement representative entry',
      [recipient('entry-b', first.email)],
    ],
  ])(
    'rejects %s before campaign creation or enqueue',
    async (_label, resolved) => {
      const h = harness(resolved);
      expect(await h.send()).toMatchObject({
        ok: false,
        error: { code: 'confirmation-changed' },
      });
      expect(h.tx.createCampaign).not.toHaveBeenCalled();
      expect(h.tx.enqueueRecipient).not.toHaveBeenCalled();
    },
  );
  it('rejects paid/withdrawn selected entries even when deduplicated recipients have not changed', async () => {
    const h = harness([first], ['entry-a']);
    expect(await h.send()).toMatchObject({
      ok: false,
      error: { code: 'confirmation-changed' },
    });
    expect(h.tx.eligibleWorkbasketEntries).toHaveBeenCalledWith(
      'event',
      'paymentOpen',
    );
    expect(h.tx.createCampaign).not.toHaveBeenCalled();
    expect(h.tx.enqueueRecipient).not.toHaveBeenCalled();
  });
  it('enqueues only the unchanged confirmed set once', async () => {
    const h = harness();
    expect(await h.send()).toMatchObject({
      ok: true,
      campaign: { campaign: { id: 'campaign' } },
    });
    expect(h.tx.enqueueRecipient).toHaveBeenCalledTimes(1);
    expect(h.tx.enqueueRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: first }),
    );
  });
  it('recovers the original immutable campaign before inspecting changed eligibility/addresses', async () => {
    const h = harness([], []);
    vi.mocked(h.tx.findByIdempotencyKey).mockImplementation(async () => ({
      requestHash: (await import('./messages.js')).fingerprintMessageRequest(
        h.input,
      ),
      campaign: { id: 'accepted-original' },
      recipients: [{ id: 'recipient' }],
    }));
    expect(await h.send()).toMatchObject({
      ok: true,
      replayed: true,
      campaign: { campaign: { id: 'accepted-original' } },
    });
    expect(h.tx.resolveRecipients).not.toHaveBeenCalled();
    expect(h.tx.eligibleWorkbasketEntries).not.toHaveBeenCalled();
    expect(h.tx.enqueueRecipient).not.toHaveBeenCalled();
  });
  it('includes the confirmation snapshot in idempotency identity', async () => {
    const h = harness();
    const original = (await import('./messages.js')).fingerprintMessageRequest(
      h.input,
    );
    h.input.workbasketConfirmation!.recipients[0]!.email =
      'changed@example.test';
    vi.mocked(h.tx.findByIdempotencyKey).mockImplementation(async () => ({
      requestHash: original,
      campaign: { id: 'original' },
      recipients: [],
    }));
    expect(await h.send()).toMatchObject({
      ok: false,
      error: { code: 'idempotency-conflict' },
    });
    expect(h.tx.enqueueRecipient).not.toHaveBeenCalled();
  });
});
