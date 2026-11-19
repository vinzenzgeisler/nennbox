import { createHash, randomBytes } from 'node:crypto';

/** Shared co-driver/driver-portal primitive: random bearer secret, hash at rest. */
export const hashPersonalLinkToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export function createPersonalLinkToken(ttlMs: number, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashPersonalLinkToken(token),
    expiresAt: new Date(now.getTime() + ttlMs),
  };
}
