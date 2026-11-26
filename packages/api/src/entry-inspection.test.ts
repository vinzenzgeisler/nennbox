import { describe, expect, it, vi } from 'vitest';
import { organizationId } from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps } from './testing.js';

const id = '20000000-0000-4000-8000-000000000001';
describe('isolated inspection permission at HTTP boundary', () => {
  it.each(['technical_inspection', 'waiver'])(
    'requires inspect, not write, for %s',
    async (dimension) => {
      for (const permissions of [['entry:write'], ['entry:inspect']]) {
        const transition = vi.fn(async () => true);
        const app = createApp(
          testDeps({
            organizations: {
              getById: async () => null,
              update: async () => null,
            },
            events: {
              listByOrganization: async () => [],
              getById: async () => null,
            },
            config: {
              deploymentMode: 'community',
              organizationId: organizationId(id),
            },
            authenticator: {
              authenticate: async () => ({ issuer: 'test', subject: 'test' }),
            },
            memberships: {
              resolvePermissions: async () => new Set(permissions),
            },
            entryStatusDimensions: { transition },
          }),
        );
        const response = await app.request(
          `/admin/entries/${id}/status-dimensions/${dimension}/transitions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              status: dimension === 'waiver' ? 'f_signed' : 'passed',
              reason: 'Checked',
            }),
          },
        );
        const allowed = permissions.includes('entry:inspect');
        expect(response.status).toBe(allowed ? 200 : 403);
        expect(transition).toHaveBeenCalledTimes(allowed ? 1 : 0);
      }
    },
  );
});
