import { describe, expect, it, vi } from 'vitest';
import { createApp } from './index.js';
import { testDeps } from './testing.js';

const eventId = '10000000-0000-4000-8000-000000000002';
const classId = '10000000-0000-4000-8000-000000000003';
const body = {
  ranges: [],
  settings: { automaticPromotion: true, confirmationHours: 24 },
  classCapacities: [{ classId, maxParticipants: 12 }],
};

function setup(permissions = ['event:write', 'class:write']) {
  const configure = vi.fn(async () => {});
  const list = vi.fn(async () => ({ ranges: [], settings: body.settings }));
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
      startNumbers: {
        configure,
        list,
        assignAll: vi.fn(),
        promoteNext: vi.fn(),
        assign: vi.fn(),
      },
    }),
  );
  const put = (payload: unknown) =>
    app.request(`/admin/events/${eventId}/start-numbers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  return { configure, put };
}

describe('atomic start-number setup endpoint', () => {
  it('passes the entire configuration to one service call', async () => {
    const { put, configure } = setup();
    expect((await put(body)).status).toBe(200);
    expect(configure).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      eventId,
      body.ranges,
      body.settings,
      body.classCapacities,
    );
  });

  it.each([['event:write'], ['class:write'], ['event:read']])(
    'requires event and class write permissions for capacities (%s)',
    async (...permissions) => {
      const { put, configure } = setup(permissions);
      expect((await put(body)).status).toBe(403);
      expect(configure).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, 2147483648, '12'])(
    'rejects invalid capacity %s before saving',
    async (maxParticipants) => {
      const { put, configure } = setup();
      expect(
        (
          await put({
            ...body,
            classCapacities: [{ classId, maxParticipants }],
          })
        ).status,
      ).toBe(400);
      expect(configure).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate classes and invalid IDs', async () => {
    const { put, configure } = setup();
    for (const classCapacities of [
      [...body.classCapacities, ...body.classCapacities],
      [{ classId: 'invalid', maxParticipants: null }],
    ])
      expect((await put({ ...body, classCapacities })).status).toBe(400);
    expect(configure).not.toHaveBeenCalled();
  });

  it('preserves compatibility for requests that do not change capacities', async () => {
    const { put } = setup(['event:write']);
    expect((await put({ ranges: [], settings: body.settings })).status).toBe(
      200,
    );
  });

  it('returns failure when the atomic transaction rejects', async () => {
    const { put, configure } = setup();
    configure.mockRejectedValueOnce(new Error('invalid-capacity'));
    expect((await put(body)).status).toBe(422);
  });
});
