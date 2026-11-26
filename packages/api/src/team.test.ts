import { describe, expect, it, vi } from 'vitest';
import {
  organizationId,
  permissionsForRole,
  ProviderError,
  type ExternalIdentity,
  type TeamRepository,
} from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps } from './testing.js';
const org = '10000000-0000-4000-8000-000000000001';
const user: ExternalIdentity = {
  issuer: 'https://id.test',
  subject: 'user',
  email: 'member@example.test',
  emailVerified: true,
};
function fixture(identity: ExternalIdentity | null = user) {
  let permissions = permissionsForRole('admin');
  const team: TeamRepository = {
    list: vi.fn(async () => ({ members: [], invitations: [], history: [] })),
    invite: vi.fn(async () => org),
    revoke: vi.fn(async () => {}),
    resend: vi.fn(async () => {}),
    change: vi.fn(async () => {}),
    redeem: vi.fn(async () => {}),
  };
  const deps = testDeps({
    config: { deploymentMode: 'community', organizationId: org },
    organizations: { getById: async () => null, update: async () => null },
    events: { listByOrganization: async () => [], getById: async () => null },
    authenticator: { authenticate: async () => identity },
    memberships: { resolvePermissions: async () => permissions },
    team,
  });
  const app = createApp(deps);
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    team,
    app,
    deps,
    post,
    disable: () => {
      permissions = new Set();
    },
  };
}
describe('team HTTP identity boundary', () => {
  it('rejects a team assembly that cannot refresh active memberships', () => {
    const f = fixture();
    delete f.deps.memberships;
    expect(() => createApp(f.deps)).toThrow(/membership resolution/);
  });
  it('redeems with authenticated OIDC identity but without an existing membership', async () => {
    const f = fixture();
    f.disable();
    expect(
      (await f.post('/auth/invitations/redeem', { token: 'a'.repeat(43) }))
        .status,
    ).toBe(204);
    expect(f.team.redeem).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organizationId(org),
        subject: { issuer: user.issuer, subject: user.subject },
      }),
      user,
      'a'.repeat(43),
    );
  });
  it('rejects unsigned identity claims and malformed bodies without calling redemption', async () => {
    const anonymous = fixture(null);
    expect(
      (
        await anonymous.post('/auth/invitations/redeem', {
          token: 'a'.repeat(43),
          email: user.email,
        })
      ).status,
    ).toBe(401);
    expect(anonymous.team.redeem).not.toHaveBeenCalled();
    const signed = fixture();
    expect(
      (
        await signed.post('/auth/invitations/redeem', {
          token: 'a'.repeat(43),
          email: user.email,
        })
      ).status,
    ).toBe(400);
    expect(
      (await signed.post('/auth/invitations/redeem', { token: 'short' }))
        .status,
    ).toBe(400);
    expect(signed.team.redeem).not.toHaveBeenCalled();
  });
  it('ends access for an ongoing session as soon as server-side permissions change', async () => {
    const f = fixture();
    expect((await f.app.request('/admin/team')).status).toBe(200);
    f.disable();
    expect((await f.app.request('/admin/team')).status).toBe(403);
    expect(
      (
        await f.post('/admin/team/invitations', {
          email: user.email,
          role: 'admin',
        })
      ).status,
    ).toBe(403);
    expect(f.team.list).toHaveBeenCalledTimes(1);
    expect(f.team.invite).not.toHaveBeenCalled();
  });
  it('refreshes delegated Cloud permissions instead of trusting a cached role', async () => {
    const f = fixture();
    f.deps.config = { deploymentMode: 'cloud' };
    f.deps.contextResolvers = {
      public: async () => null,
      member: async () => ({
        deploymentMode: 'cloud',
        organizationId: organizationId(org),
        subject: user,
        permissions: permissionsForRole('admin'),
        capabilities: new Set(),
        correlationId: 'test',
      }),
    };
    const cloud = createApp(f.deps);
    expect((await cloud.request('/admin/team')).status).toBe(200);
    f.disable();
    expect((await cloud.request('/admin/team')).status).toBe(403);
  });
  it.each([
    ['forbidden', 403],
    ['conflict', 409],
    ['not_found', 404],
    ['invalid_input', 400],
    ['not_configured', 503],
  ] as const)(
    'maps %s without leaking invitation details',
    async (code, status) => {
      const f = fixture();
      vi.mocked(f.team.redeem).mockRejectedValueOnce(
        new ProviderError(code, 'sensitive token or tenant data'),
      );
      const response = await f.post('/auth/invitations/redeem', {
        token: 'a'.repeat(43),
      });
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('sensitive');
    },
  );
});
