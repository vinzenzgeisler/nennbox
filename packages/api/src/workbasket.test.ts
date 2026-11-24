import { describe, it, expect, vi } from 'vitest';
import { resolveWorkbasketConfig } from '@nennbox/core';
import { createApp } from './index.js';
import { testDeps } from './testing.js';

const eventId = '10000000-0000-4000-8000-000000000002';
const entryId = '10000000-0000-4000-8000-000000000003';
function setup(
  permissions = [
    'entry:read',
    'event:read',
    'event:write',
    'organization:read',
    'organization:update',
  ],
) {
  const tasks = vi.fn(async () => ({ tasks: [], counts: {}, generation: 1 }));
  const warnings = vi.fn(async () => []);
  const configuration = {
    organization: {},
    event: {},
    effective: resolveWorkbasketConfig(),
  };
  const configure = vi.fn(async () => configuration);
  const app = createApp(
    testDeps({
      config: {
        deploymentMode: 'community',
        organizationId: '10000000-0000-4000-8000-000000000001',
      },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: {
        authenticate: async () => ({ issuer: 'test', subject: 'user' }),
      },
      memberships: { resolvePermissions: async () => new Set(permissions) },
      workbasket: {
        tasks,
        warnings,
        configure,
        getConfiguration: vi.fn(async () => configuration),
      },
    }),
  );
  return { app, tasks, warnings, configure };
}
describe('workbasket API', () => {
  it('exposes cached tasks/counters and entry warnings without triggering an action', async () => {
    const { app, tasks, warnings, configure } = setup();
    const response = await app.request(
      '/admin/events/' + eventId + '/workbasket',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tasks: [],
      counts: {},
      generation: 1,
    });
    expect(tasks).toHaveBeenCalledExactlyOnceWith(expect.anything(), eventId);
    expect(
      (
        await app.request(
          '/admin/events/' + eventId + '/entries/' + entryId + '/warnings',
        )
      ).status,
    ).toBe(200);
    expect(warnings).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      eventId,
      entryId,
    );
    expect(configure).not.toHaveBeenCalled();
  });
  it('requires explicit write permission; rejects malformed config and IDs before persistence', async () => {
    const { app, configure } = setup(['entry:read']);
    const path = '/admin/events/' + eventId + '/workbasket/configuration';
    expect(
      (await app.request(path, { method: 'PUT', body: '{}' })).status,
    ).toBe(403);
    expect(
      (await app.request('/admin/events/not-a-uuid/workbasket')).status,
    ).toBe(400);
    expect(configure).not.toHaveBeenCalled();
    const allowed = setup();
    for (const body of [
      { ready: { enabled: 'yes' } },
      { paymentOpen: { days: -1 } },
      { madeUp: { enabled: true } },
    ]) {
      expect(
        (
          await allowed.app.request(path, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(400);
    }
    expect(allowed.configure).not.toHaveBeenCalled();
    expect(
      (
        await allowed.app.request(path, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ready: { enabled: false } }),
        })
      ).status,
    ).toBe(200);
  });
  it('isolates read permissions and requires organization update authority for defaults', async () => {
    const { app, tasks } = setup([]);
    expect(
      (await app.request('/admin/events/' + eventId + '/workbasket')).status,
    ).toBe(403);
    expect(tasks).not.toHaveBeenCalled();
    expect(
      (
        await app.request('/admin/organization/workbasket/configuration', {
          method: 'PUT',
          body: '{}',
        })
      ).status,
    ).toBe(403);
  });
});
