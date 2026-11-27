import { describe, expect, it, vi } from 'vitest';
import {
  permissionsForRole,
  ProviderError,
  type ExternalIdentity,
  type ParticipantMemoryRepository,
} from '@nennbox/core';
import { createApp } from './app.js';
import { testDeps, testRegistration } from './testing.js';

const org = '10000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(43);
const identity = { organizationId: org, email: 'fahrer@example.test' };
const user: ExternalIdentity = {
  issuer: 'https://id.test',
  subject: 'admin',
  email: 'admin@example.test',
  emailVerified: true,
};

function fixture(role: 'admin' | 'viewer' = 'admin') {
  const memory = {
    settings: vi.fn(async () => ({ enabled: true })),
    configure: vi.fn(async () => ({ enabled: false, purged: 3 })),
    requestAccess: vi.fn(async () => {}),
    redeemAccess: vi.fn(async (_c: unknown, value: string) =>
      value === token ? 'b'.repeat(43) : null,
    ),
    redeemDelete: vi.fn(async (_c: unknown, value: string) => value === token),
    session: vi.fn(async (_c: unknown, value: string) =>
      value === 'b'.repeat(43) ? identity : null,
    ),
    endSession: vi.fn(async () => {}),
    view: vi.fn(async () => ({
      consent: { granted: true, grantedAt: null, wordingVersion: 'v' },
      offer: null,
    })),
    take: vi.fn(async () => ({
      driver: {},
      vehicles: [],
      passenger: {},
      documents: [],
    })),
    grantConsent: vi.fn(async () => true),
    revokeConsent: vi.fn(async () => {}),
  } satisfies ParticipantMemoryRepository;
  const app = createApp(
    testDeps({
      config: { deploymentMode: 'community', organizationId: org },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      authenticator: { authenticate: async () => user },
      memberships: { resolvePermissions: async () => permissionsForRole(role) },
      publicRegistration: testRegistration({}),
      participantMemory: memory,
    }),
  );
  const send = (
    path: string,
    init: {
      method?: string;
      body?: unknown;
      cookie?: boolean;
      origin?: string;
    } = {},
  ) =>
    app.request(
      path,
      {
        method: init.method ?? 'POST',
        headers: {
          'content-type': 'application/json',
          ...(init.cookie
            ? { cookie: `participant_memory_session=${'b'.repeat(43)}` }
            : {}),
          ...(init.origin ? { origin: init.origin } : {}),
          authorization: 'Bearer test',
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      },
      { incoming: { socket: { remoteAddress: '203.0.113.9' } } },
    );
  return { memory, app, send };
}

describe('participant memory public routes', () => {
  it('answers link requests identically whatever the club knows and never echoes input', async () => {
    const f = fixture();
    const known = await f.send('/public/participant-memory/request', {
      body: { email: 'bekannt@example.test' },
    });
    f.memory.requestAccess.mockResolvedValueOnce(undefined);
    const unknown = await f.send('/public/participant-memory/request', {
      body: { email: 'unbekannt@example.test' },
    });
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ accepted: true });
    expect(await unknown.json()).toEqual({ accepted: true });
    expect(f.memory.requestAccess).toHaveBeenCalledTimes(2);
    expect(
      (
        await f.send('/public/participant-memory/request', {
          body: { email: 'a@b.c', extra: 1 },
        })
      ).status,
    ).toBe(400);
    expect(known.headers.get('cache-control')).toBe('private, no-store');
  });

  it('redeems a link once into an HttpOnly, path-scoped cookie and reveals nothing on failure', async () => {
    const f = fixture();
    const ok = await f.send('/public/participant-memory/redeem', {
      body: { token },
    });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie')!;
    expect(cookie).toMatch(
      /^participant_memory_session=b{43}; HttpOnly; SameSite=Strict; Path=\/public\/participant-memory; Max-Age=3600/,
    );
    const bad = await f.send('/public/participant-memory/redeem', {
      body: { token: 'c'.repeat(43) },
    });
    expect(bad.status).toBe(404);
    expect(bad.headers.get('set-cookie')).toBeNull();
    expect(
      (
        await f.send('/public/participant-memory/redeem', {
          body: { token: 'short' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.send('/public/participant-memory/redeem', {
          body: { token },
          origin: 'https://evil.test',
        })
      ).status,
    ).toBe(404);
  });

  it('serves the offer, consent and take only with a valid session and the tenant of the request', async () => {
    const f = fixture();
    expect(
      (
        await f.send('/public/participant-memory?eventSlug=race', {
          method: 'GET',
        })
      ).status,
    ).toBe(404);
    const view = await f.send('/public/participant-memory?eventSlug=race', {
      method: 'GET',
      cookie: true,
    });
    expect(view.status).toBe(200);
    expect((await view.json()).consent.terms.de).toMatch(/willige ein/);
    expect(f.memory.view).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: org }),
      identity,
      'race',
    );
    expect(
      (
        await f.send('/public/participant-memory/take', {
          body: { eventSlug: 'race' },
        })
      ).status,
    ).toBe(404);
    expect(f.memory.take).not.toHaveBeenCalled();
    const take = await f.send('/public/participant-memory/take', {
      cookie: true,
      body: { eventSlug: 'race', driver: ['firstName'] },
    });
    expect(take.status).toBe(200);
    // Unknown field names are rejected before the repository is called.
    expect(
      (
        await f.send('/public/participant-memory/take', {
          cookie: true,
          body: { eventSlug: 'race', driver: ['passwordHash'] },
        })
      ).status,
    ).toBe(400);
    expect(f.memory.take).toHaveBeenCalledTimes(1);
    expect(
      (
        await f.send('/public/participant-memory/take', {
          cookie: true,
          origin: 'https://evil.test',
          body: { eventSlug: 'race' },
        })
      ).status,
    ).toBe(404);
  });

  it('grants consent for the current wording only and revokes on request', async () => {
    const f = fixture();
    expect(
      (
        await f.send('/public/participant-memory/consent', {
          cookie: true,
          body: { wordingVersion: 'v1' },
        })
      ).status,
    ).toBe(200);
    f.memory.grantConsent.mockResolvedValueOnce(false);
    const stale = await f.send('/public/participant-memory/consent', {
      cookie: true,
      body: { wordingVersion: 'old' },
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).wordingVersion).toMatch(
      /^\d{4}-\d{2}-\d{2}\.\d+$/,
    );
    expect(
      (
        await f.send('/public/participant-memory/consent', {
          body: { wordingVersion: 'v1' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.send('/public/participant-memory/consent/revoke', {
          cookie: true,
        })
      ).status,
    ).toBe(200);
    expect(f.memory.revokeConsent).toHaveBeenCalledOnce();
    expect(
      (await f.send('/public/participant-memory/consent/revoke')).status,
    ).toBe(404);
  });

  it('deletes through the one-time link and says nothing about failures', async () => {
    const f = fixture();
    expect(
      await (
        await f.send('/public/participant-memory/delete', { body: { token } })
      ).json(),
    ).toEqual({ deleted: true });
    const fail = await f.send('/public/participant-memory/delete', {
      body: { token: 'd'.repeat(43) },
    });
    expect(fail.status).toBe(404);
    expect(await fail.json()).toEqual({ error: 'Link unavailable' });
    expect(
      (
        await f.send('/public/participant-memory/delete-request', {
          body: { email: 'x@example.test' },
        })
      ).status,
    ).toBe(200);
    expect(f.memory.requestAccess).toHaveBeenCalledWith(
      expect.anything(),
      'x@example.test',
      'delete',
      'de',
    );
  });

  it('ends the session on logout', async () => {
    const f = fixture();
    const out = await f.send('/public/participant-memory/logout', {
      cookie: true,
    });
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(f.memory.endSession).toHaveBeenCalled();
  });
});

describe('participant memory admin settings', () => {
  it('lets administrators read and change the settings', async () => {
    const f = fixture();
    expect(
      (await f.send('/admin/participant-memory', { method: 'GET' })).status,
    ).toBe(200);
    const put = await f.send('/admin/participant-memory', {
      method: 'PUT',
      body: { enabled: false, retentionDays: 90 },
    });
    expect(put.status).toBe(200);
    expect(f.memory.configure).toHaveBeenCalledWith(expect.anything(), {
      enabled: false,
      retentionDays: 90,
    });
  });
  it('refuses members without organization update permission and malformed bodies', async () => {
    const f = fixture('viewer');
    expect(
      (await f.send('/admin/participant-memory', { method: 'GET' })).status,
    ).toBe(403);
    expect(
      (
        await f.send('/admin/participant-memory', {
          method: 'PUT',
          body: { enabled: true },
        })
      ).status,
    ).toBe(403);
    expect(f.memory.configure).not.toHaveBeenCalled();
    const admin = fixture();
    expect(
      (
        await admin.send('/admin/participant-memory', {
          method: 'PUT',
          body: {},
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.send('/admin/participant-memory', {
          method: 'PUT',
          body: { retentionDays: 'x' },
        })
      ).status,
    ).toBe(400);
  });
  it('maps out-of-bounds retention to a client error without leaking internals', async () => {
    const f = fixture();
    f.memory.configure.mockRejectedValueOnce(
      new ProviderError('invalid_input', 'invalid_input'),
    );
    const res = await f.send('/admin/participant-memory', {
      method: 'PUT',
      body: { retentionDays: 5 },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Rejected' });
  });
});
