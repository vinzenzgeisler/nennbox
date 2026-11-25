import { describe, expect, it, vi } from 'vitest';
import {
  ConcurrentUpdateError,
  isRetryableConflict,
  retryOnConflict,
} from './transaction-retry.js';

const deadlock = () =>
  Object.assign(new Error('deadlock detected'), { code: '40P01' });

describe('retryOnConflict', () => {
  it('recognizes deadlocks and serialization failures, also wrapped by a driver error', () => {
    expect(isRetryableConflict(deadlock())).toBe(true);
    expect(
      isRetryableConflict(Object.assign(new Error('x'), { code: '40001' })),
    ).toBe(true);
    expect(
      isRetryableConflict(
        Object.assign(new Error('Failed query'), { cause: deadlock() }),
      ),
    ).toBe(true);
    expect(
      isRetryableConflict(Object.assign(new Error('x'), { code: '23505' })),
    ).toBe(false);
    expect(isRetryableConflict(new Error('refund_in_progress'))).toBe(false);
    expect(isRetryableConflict(null)).toBe(false);
  });
  it('repeats the whole transaction after a deadlock and returns its result', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(deadlock())
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValueOnce('done');
    expect(await retryOnConflict(run)).toBe('done');
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('reports a persistent clash as concurrent_update instead of a raw database error', async () => {
    const run = vi.fn().mockRejectedValue(deadlock());
    const failure = await retryOnConflict(run).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConcurrentUpdateError);
    expect((failure as Error).message).toBe('concurrent_update');
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('never repeats a business error', async () => {
    const run = vi.fn().mockRejectedValue(new Error('refund_in_progress'));
    await expect(retryOnConflict(run)).rejects.toThrow('refund_in_progress');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
