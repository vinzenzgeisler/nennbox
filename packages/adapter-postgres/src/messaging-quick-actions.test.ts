import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRequestContext,
  organizationId,
  staticCanonicalOrigin,
  type MessageRecipientFilter,
} from '@nennbox/core';
import type { Database } from './database.js';
import { createMessageQuickActions } from './messaging-quick-actions.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('./messaging-send.js', () => ({ createMessageSender: () => send }));

const context = createRequestContext({
  deploymentMode: 'community',
  organizationId: organizationId('00000000-0000-4000-8000-000000000001'),
  permissions: new Set(),
  capabilities: new Set(),
  correlationId: 'test',
});
const filter: MessageRecipientFilter = {
  classIds: ['class-a'],
  statuses: [],
  entryStatusIds: ['waitlist', 'custom-review'],
  emailVerified: false,
  payment: 'any',
  entryIds: ['entry-a'],
  additionalAddresses: ['manual@example.test'],
};
const quickAction = createMessageQuickActions(
  {} as Database,
  staticCanonicalOrigin('https://example.test'),
);

describe('scoped message quick actions', () => {
  beforeEach(() => send.mockReset());

  it('intersects the visible selection with open payments and excludes manual addresses', async () => {
    await quickAction(
      context,
      'event-a',
      'remind-open-payments',
      'actor',
      filter,
    );
    expect(send).toHaveBeenCalledWith(
      context,
      'event-a',
      expect.any(String),
      expect.objectContaining({
        recipients: { ...filter, payment: 'open', additionalAddresses: [] },
      }),
      'actor',
      expect.any(Object),
    );
  });

  it('preserves the visible filters when resending verification', async () => {
    await quickAction(
      context,
      'event-a',
      'resend-verification',
      'actor',
      filter,
    );
    expect(send).toHaveBeenCalledWith(
      context,
      'event-a',
      expect.any(String),
      expect.objectContaining({
        recipients: {
          ...filter,
          emailVerified: false,
          additionalAddresses: [],
        },
      }),
      'actor',
      expect.any(Object),
    );
  });

  it.each(['paid', 'unpaid'] as const)(
    'does not widen a conflicting %s payment selection',
    async (payment) => {
      expect(
        await quickAction(context, 'event-a', 'remind-open-payments', 'actor', {
          ...filter,
          payment,
        }),
      ).toMatchObject({
        ok: false,
        error: { code: 'no-recipients' },
      });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('does not widen a verified-only selection when resending verification', async () => {
    expect(
      await quickAction(context, 'event-a', 'resend-verification', 'actor', {
        ...filter,
        emailVerified: true,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'no-recipients' },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
