import { WorkbasketConcurrencyError } from '@nennbox/core';

/**
 * What a failed acceptance transition answers. Refund conflicts and a change
 * the database aborted after retries say what is wrong and that nothing was
 * changed; every other failure stays the generic permission answer.
 */
export function transitionFailure(error: unknown): {
  status: 403 | 409;
  body: { error: string; reason?: string };
} {
  const reason = error instanceof Error ? error.message : '';
  if (
    error instanceof WorkbasketConcurrencyError ||
    reason.startsWith('Nicht mehr bereit')
  )
    return { status: 409, body: { error: reason } };
  if (reason === 'refund_in_progress')
    return {
      status: 409,
      body: {
        error: 'Refund in progress; reconcile before reactivation',
        reason,
      },
    };
  if (reason === 'refund_needs_review')
    return {
      status: 409,
      body: {
        error: 'Refund needs review; resolve it before reactivation',
        reason,
      },
    };
  if (reason === 'concurrent_update')
    return {
      status: 409,
      body: { error: 'Concurrent update; try again', reason },
    };
  return { status: 403, body: { error: 'Forbidden or invalid transition' } };
}
