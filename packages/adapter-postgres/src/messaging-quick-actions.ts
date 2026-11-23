import {
  resolveCanonicalOrigin,
  type CanonicalOrigin,
  type RequestContext,
  type MessageRecipientFilter,
} from '@nennbox/core';
import { createMessageSender } from './messaging-send.js';
import { messageCampaignDelivery } from '@nennbox/core';
import type { Database } from './database.js';

export type MessageQuickAction = 'resend-verification' | 'remind-open-payments';

export function createMessageQuickActions(
  db: Database,
  canonicalOrigin: CanonicalOrigin | undefined,
) {
  const send = createMessageSender(db, undefined, canonicalOrigin);
  return async (
    ctx: RequestContext,
    eventId: string,
    action: MessageQuickAction,
    actor: string,
    recipients: MessageRecipientFilter = {
      classIds: [],
      statuses: [],
      entryStatusIds: [],
      payment: 'any',
      entryIds: [],
      additionalAddresses: [],
    },
  ) => {
    const originAvailable =
      canonicalOrigin !== undefined &&
      (await resolveCanonicalOrigin(canonicalOrigin, ctx)) !== null;
    if (action === 'resend-verification' && !originAvailable)
      return {
        ok: false as const,
        error: {
          code: 'verification-unavailable' as const,
          message: 'Registration verification is unavailable',
        },
      };
    // Intersect the visible selection with the action, never widen conflicting filters.
    if (
      (action === 'remind-open-payments' &&
        recipients.payment !== 'any' &&
        recipients.payment !== 'open') ||
      (action === 'resend-verification' && recipients.emailVerified === true)
    )
      return {
        ok: false as const,
        error: {
          code: 'no-recipients' as const,
          message: 'No recipients match the selected filters',
        },
      };
    const selected = { ...recipients, additionalAddresses: [] };
    const input =
      action === 'resend-verification'
        ? {
            eventId,
            recipients: {
              ...selected,
              emailVerified: false as const,
            },
            subject: 'Verify your email address',
            text: 'Follow the verification link to confirm your email address.',
            attachments: [],
          }
        : {
            eventId,
            recipients: {
              ...selected,
              payment: 'open' as const,
            },
            subject: 'Payment reminder for {{eventName}}',
            text: 'This is a reminder that a payment for {{eventName}} is still open. Please review your payment details.',
            attachments: [],
          };
    return send(
      ctx,
      eventId,
      `quick-action:${action}:${crypto.randomUUID()}`,
      input,
      actor,
      action === 'resend-verification'
        ? {
            auditAction: action,
            validateRecipients: (recipients) =>
              originAvailable &&
              recipients.every((recipient) => recipient.registrationGroupId)
                ? { ok: true as const }
                : {
                    ok: false as const,
                    error: {
                      code: 'verification-unavailable' as const,
                      message: 'Registration verification is unavailable',
                    },
                  },
            enqueue: async (tx, value) => {
              const recipient = await tx.enqueueVerificationRecipient(value);
              return recipient
                ? { ok: true as const, recipient }
                : {
                    ok: false as const,
                    error: {
                      code: 'verification-unavailable' as const,
                      message: 'Registration verification is unavailable',
                    },
                  };
            },
          }
        : { ...messageCampaignDelivery(), auditAction: action },
    );
  };
}
