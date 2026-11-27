import { describe, expect, it } from 'vitest';
import type { ObjectStorageProvider } from '@nennbox/core';
import type { DriverPortalRepository } from '@nennbox/adapter-postgres';
import { createApp } from './app.js';
import { testDeps, testRegistration } from './testing.js';

const organization = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = 'a'.repeat(43);
const entryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// The upload gate follows the category the repository resolved from the pinned
// workflow, never the raw status key.
function upload(owned: { status: string; statusCategory: string }) {
  const driverPortal = {
    session: async (_ctx: unknown, value: string) =>
      value === token ? { groupId: 'group' } : null,
    ownsEntry: async () => ({ id: entryId, ...owned }),
  } as unknown as DriverPortalRepository;
  const objectStorage = {} as ObjectStorageProvider;
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: organization },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      driverPortal,
      objectStorage,
      publicRegistration: testRegistration({}),
    }),
  );
  return app.request(`/public/driver-portal/entries/${entryId}/documents`, {
    method: 'POST',
    headers: { cookie: `driver_portal_session=${token}` },
  });
}

describe('driver portal document upload gate', () => {
  it('refuses an entry whose pinned category is withdrawn, whatever its key', async () => {
    expect(
      (await upload({ status: 'gone-w', statusCategory: 'withdrawn' })).status,
    ).toBe(404);
  });
  it('lets an entry through whose key says withdrawn but whose category is accepted', async () => {
    // Past the gate the request is stopped by the (unconfigured) rate budget.
    expect(
      (await upload({ status: 'withdrawn', statusCategory: 'accepted' }))
        .status,
    ).toBe(503);
  });
});
