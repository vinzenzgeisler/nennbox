import { createHmac } from 'node:crypto';
import { ProviderError } from '@nennbox/core';

/** Derive the bearer only in API/worker memory; persistent outbox carries a public nonce. */
export function deriveTeamInvitationToken(
  key: string | undefined,
  nonce: string,
): string {
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new ProviderError(
      'not_configured',
      'Invitation token key is not configured',
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce))
    throw new ProviderError('invalid_input', 'Invalid invitation nonce');
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(nonce)
    .digest('base64url');
}
