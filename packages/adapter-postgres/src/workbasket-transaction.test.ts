import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.js';
import { workbasketTransaction } from './workbasket-transaction.js';

describe('authoritative transaction retry boundary', () => {
  it.each(['40001', '40P01'])(
    'retries the whole transaction for nested %s',
    async (code) => {
      const work = vi.fn();
      const transaction = vi
        .fn()
        .mockRejectedValueOnce(new Error('query', { cause: { code } }))
        .mockResolvedValue('committed');
      expect(
        await workbasketTransaction(
          { transaction } as unknown as Database,
          true,
          work,
        ),
      ).toBe('committed');
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(transaction).toHaveBeenNthCalledWith(2, work, {
        isolationLevel: 'serializable',
      });
    },
  );
  it('stops after three attempts with actionable feedback', async () => {
    const transaction = vi.fn().mockRejectedValue({ code: '40001' });
    await expect(
      workbasketTransaction(
        { transaction } as unknown as Database,
        true,
        vi.fn(),
      ),
    ).rejects.toThrow('Bitte erneut versuchen');
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it('does not retry unrelated failures or change ordinary transactions', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('broken'));
    const db = { transaction } as unknown as Database;
    await expect(workbasketTransaction(db, true, vi.fn())).rejects.toThrow(
      'broken',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    transaction.mockResolvedValueOnce('ordinary');
    const work = vi.fn();
    expect(await workbasketTransaction(db, false, work)).toBe('ordinary');
    expect(transaction).toHaveBeenLastCalledWith(work);
  });
});
