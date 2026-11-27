import { createHash, createHmac, randomBytes } from 'node:crypto';
import { ProviderError } from '@nennbox/core';
import type { ParticipantMemoryAccessPurpose } from '@nennbox/core';

export const hashParticipantMemoryToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const participantMemoryTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/**
 * Same discipline as team invitations: the persistent mail outbox carries only a
 * public random nonce; API and worker derive the bearer in memory from the shared
 * key. The purpose is part of the MAC input, so a team invitation or an access
 * link can never be replayed as a delete link (domain separation).
 */
export function deriveParticipantMemoryToken(
  key: string | undefined,
  purpose: ParticipantMemoryAccessPurpose,
  nonce: string,
): string {
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new ProviderError(
      'not_configured',
      'Participant memory token key is not configured',
    );
  if (!participantMemoryTokenPattern.test(nonce))
    throw new ProviderError(
      'invalid_input',
      'Invalid participant memory nonce',
    );
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`participant-memory:${purpose}:${nonce}`)
    .digest('base64url');
}
export const newParticipantMemoryNonce = () =>
  randomBytes(32).toString('base64url');
