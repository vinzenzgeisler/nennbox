import { describe, expect, it, vi } from 'vitest';
import { createRequestContext, organizationId } from '@racepilot/core';
import { allocateOrgaCode } from './orga-code.js';
import type { TransactionDatabase } from './database.js';

describe('PostgreSQL Orga-Code allocation', () => {
  it('retries a globally occupied code before returning a free code', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const tx = { execute } as unknown as TransactionDatabase;
    const candidates = ['AAAAA', 'BBBBB'];
    const ctx = createRequestContext({
      deploymentMode: 'community',
      organizationId: organizationId('11111111-1111-4111-8111-111111111111'),
      permissions: new Set(['entry:write']),
      capabilities: new Set(),
      correlationId: 'orga-code-collision',
    });

    await expect(
      allocateOrgaCode(tx, ctx, '22222222-2222-4222-8222-222222222222', () =>
        candidates.shift()!,
      ),
    ).resolves.toBe('BBBBB');
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
