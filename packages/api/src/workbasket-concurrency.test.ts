import { expect, it } from 'vitest';
import {
  defaultEntryWorkflow,
  organizationId,
  WorkbasketConcurrencyError,
} from '@nennbox/core';
import { createApp } from './index.js';
import { testDeps } from './testing.js';

it('reports exhausted admission retries as a retryable conflict, not forbidden', async () => {
  const org = organizationId('11111111-1111-4111-8111-111111111111');
  const event = '22222222-2222-4222-8222-222222222222';
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({
          issuer: 'https://id.example',
          subject: 'admin',
        }),
      },
      memberships: {
        resolvePermissions: async () => new Set(['entry:read', 'entry:write']),
      },
      entries: {
        getById: async () =>
          ({
            id: 'entry',
            eventId: event,
            acceptanceStatus: 'pending',
            verificationStatus: 'unverified',
          }) as never,
        transition: async () => {
          throw new WorkbasketConcurrencyError({ code: '40001' });
        },
      },
      entryWorkflows: {
        getPinnedForEntry: async () => ({
          id: 'revision',
          organizationId: org,
          eventId: event,
          version: 1,
          workflow: defaultEntryWorkflow,
        }),
      },
    }),
  );
  const response = await app.request('/admin/entries/entry/transitions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      transition: 'acceptance',
      status: 'accepted',
      reason: 'checked',
      requireReadyForEvent: event,
    }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: expect.stringContaining('Bitte erneut versuchen'),
  });
});
