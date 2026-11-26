import { describe, expect, it } from 'vitest';
import { permissionsForRole } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createEntryStatusDimensionRepository } from './entry-status-dimensions.js';
import { createEntryRepository } from './entry-repository.js';
import { createEntryDetailRepository } from './entry-detail.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('on-site permission at repository boundary', () => {
  it.each([
    'admin',
    'office',
    'cashier',
    'scrutineer',
    'viewer',
    'write-only',
  ] as const)('%s may only change the authorized dimensions', async (role) => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    try {
      const a = await seed('inspection');
      const ctx = {
        ...a.ctx,
        permissions:
          role === 'write-only'
            ? new Set(['entry:write'])
            : permissionsForRole(role),
      };
      const dimensions = createEntryStatusDimensionRepository(db);
      const allowed = ['admin', 'office', 'scrutineer'].includes(role);
      for (const dimension of ['technical_inspection', 'waiver'] as const) {
        const result = dimensions.transition(
          ctx,
          a.entry.id,
          dimension,
          dimension === 'waiver' ? 'f_signed' : 'passed',
          'test',
          'Checked',
        );
        if (allowed) await expect(result).resolves.toBe(true);
        else await expect(result).rejects.toThrow('Forbidden');
      }
      const audit = await pool.query(
        'SELECT count(*)::int n FROM entry_status_dimension_audit WHERE entry_id=$1',
        [a.entry.id],
      );
      expect(audit.rows[0].n).toBe(allowed ? 2 : 0);
      if (role === 'scrutineer') {
        const entries = createEntryRepository(db);
        for (const to of ['accepted', 'rejected']) {
          await expect(
            entries.transition(
              ctx,
              a.entry.id,
              'acceptance',
              'pending',
              to,
              'test',
              'Forbidden attempt',
            ),
          ).rejects.toThrow('Forbidden');
        }
        const detail = createEntryDetailRepository(db);
        await expect(
          detail.updateDriver(
            ctx,
            a.entry.id,
            { firstName: 'Changed' },
            'test',
          ),
        ).rejects.toThrow('Forbidden');
        await expect(
          detail.updateVehicle(ctx, a.entry.id, { make: 'Changed' }, 'test'),
        ).rejects.toThrow('Forbidden');
        await expect(
          dimensions.updateHints(
            ctx,
            a.entry.id,
            { passenger: true },
            'test',
            'Forbidden attempt',
          ),
        ).rejects.toThrow('Forbidden');
        const stored = await pool.query(
          'SELECT acceptance_status FROM entry WHERE id=$1',
          [a.entry.id],
        );
        expect(stored.rows[0].acceptance_status).toBe('pending');
      }
    } finally {
      await seed.cleanup();
      await pool.end();
    }
  });
});
