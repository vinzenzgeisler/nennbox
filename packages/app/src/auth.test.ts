// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const oidc = vi.hoisted(() => ({
  getUser: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signinRedirect: vi.fn(),
  signinSilent: vi.fn(),
  signoutRedirect: vi.fn(),
  userLoaded: null as
    | ((user: {
        access_token?: string;
        expired?: boolean;
        profile?: unknown;
      }) => void)
    | null,
  userUnloaded: null as (() => void) | null,
  managerOptions: null as Record<string, unknown> | null,
}));
vi.mock('oidc-client-ts', () => ({
  UserManager: class {
    constructor(options: Record<string, unknown>) {
      oidc.managerOptions = options;
    }
    getUser = oidc.getUser;
    signinRedirectCallback = oidc.signinRedirectCallback;
    signinRedirect = oidc.signinRedirect;
    signinSilent = oidc.signinSilent;
    signoutRedirect = oidc.signoutRedirect;
    events = {
      addUserLoaded: (callback: typeof oidc.userLoaded) => {
        oidc.userLoaded = callback;
      },
      addUserUnloaded: (callback: typeof oidc.userUnloaded) => {
        oidc.userUnloaded = callback;
      },
    };
  },
  WebStorageStateStore: class {},
}));

describe('Community OIDC browser session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/app');
    window.sessionStorage.clear();
  });

  it('adds the verified session token only to relative admin API calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    oidc.getUser.mockResolvedValue({ access_token: 'secret', expired: false });
    const { restoreAdminSession, adminFetch } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');
    await adminFetch('/admin/events');
    await adminFetch('https://other.example.test/admin/events');
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toHaveProperty(
      'get',
    );
    expect(
      ((fetchMock.mock.calls[1]![1] as RequestInit).headers as Headers).get(
        'Authorization',
      ),
    ).toBe('Bearer secret');
    expect(
      ((fetchMock.mock.calls[2]![1] as RequestInit).headers as Headers).get(
        'Authorization',
      ),
    ).toBeNull();
    vi.unstubAllGlobals();
  });

  it('silently refreshes an expired token and enables refresh-token renewal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    oidc.getUser.mockResolvedValue({ access_token: 'old', expired: true });
    oidc.signinSilent.mockResolvedValue({
      access_token: 'renewed',
      expired: false,
    });
    const { restoreAdminSession } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');
    expect(oidc.signinSilent).toHaveBeenCalledOnce();
    expect(oidc.managerOptions).toMatchObject({ automaticSilentRenew: true });
    vi.unstubAllGlobals();
  });

  it('uses renewed event tokens and clears expired or unloaded tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            oidc: {
              issuerUrl: 'https://login.example.test/realm',
              clientId: 'nennbox-app',
              redirectUri: 'https://app.example.test/auth/callback',
            },
          }),
        })
        .mockResolvedValue({ ok: true }),
    );
    oidc.getUser.mockResolvedValue({ access_token: 'initial', expired: false });
    const { restoreAdminSession, adminFetch } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');

    oidc.userLoaded?.({ access_token: 'renewed', expired: false });
    await adminFetch('/admin/events');
    const fetchMock = vi.mocked(fetch);
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization'),
    ).toBe('Bearer renewed');

    oidc.userLoaded?.({ access_token: 'expired', expired: true });
    await adminFetch('/admin/events');
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('Authorization'),
    ).toBeNull();

    oidc.userLoaded?.({ access_token: 'another-token', expired: false });
    oidc.userUnloaded?.();
    await adminFetch('/admin/events');
    expect(
      new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get('Authorization'),
    ).toBeNull();
    vi.unstubAllGlobals();
  });

  it('performs provider logout and suppresses automatic SSO resume on return', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    oidc.getUser.mockResolvedValue({ access_token: 'active', expired: false });
    const { restoreAdminSession, signOut } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');
    await signOut();
    expect(oidc.signoutRedirect).toHaveBeenCalledOnce();
    expect(oidc.managerOptions).toMatchObject({
      post_logout_redirect_uri: 'https://app.example.test/auth/callback',
    });

    expect(await restoreAdminSession()).toBe('signed-out');
    expect(oidc.getUser).toHaveBeenCalledOnce();
    expect(oidc.signinRedirect).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('checks the existing Keycloak SSO session when no browser token is stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    oidc.getUser.mockResolvedValue(null);
    const { restoreAdminSession } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('signed-out');
    expect(oidc.signinRedirect).toHaveBeenCalledWith({
      extraQueryParams: { prompt: 'none' },
    });
    vi.unstubAllGlobals();
  });

  it('falls back to interactive login when Keycloak has no SSO session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    window.history.replaceState(
      null,
      '',
      '/auth/callback?error=login_required&state=opaque',
    );
    oidc.signinRedirectCallback.mockRejectedValue(new Error('login_required'));
    const { restoreAdminSession } = await import('./auth.js');
    await expect(restoreAdminSession()).rejects.toThrow('login_required');
    expect(oidc.signinRedirect).toHaveBeenCalledOnce();
    expect(oidc.signinRedirect).toHaveBeenCalledWith();
    vi.unstubAllGlobals();
  });

  it('does not permit admin access when OIDC is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ oidc: null }) }),
    );
    const { restoreAdminSession } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('disabled');
    expect(oidc.getUser).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('clears the authorization code from the callback URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    window.history.replaceState(
      null,
      '',
      '/auth/callback?code=secret&state=opaque',
    );
    oidc.signinRedirectCallback.mockResolvedValue({
      access_token: 'secret',
      expired: false,
    });
    const { restoreAdminSession } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');
    expect(window.location.pathname + window.location.search).toBe('/app');
    vi.unstubAllGlobals();
  });

  it('consumes a concurrent OIDC callback only once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    window.history.replaceState(
      null,
      '',
      '/auth/callback?code=secret&state=opaque',
    );
    oidc.signinRedirectCallback.mockResolvedValue({
      access_token: 'secret',
      expired: false,
    });
    const { restoreAdminSession } = await import('./auth.js');
    expect(
      await Promise.all([restoreAdminSession(), restoreAdminSession()]),
    ).toEqual(['ready', 'ready']);
    expect(oidc.signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe('/app');
    vi.unstubAllGlobals();
  });
});

describe('edition auth client', () => {
  it('uses a supplied client without starting the Community OIDC flow', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./auth.js');
    const response = new Response(null, { status: 204 });
    const client = {
      restoreAdminSession: vi.fn().mockResolvedValue('ready' as const),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      getAdminIdentity: vi
        .fn()
        .mockReturnValue({ name: 'Cloud Admin', role: 'admin' }),
      adminFetch: vi.fn().mockResolvedValue(response),
    };
    auth.configureAuthClient(client);
    try {
      expect(await auth.restoreAdminSession()).toBe('ready');
      expect(auth.getAdminIdentity()).toEqual({
        name: 'Cloud Admin',
        role: 'admin',
      });
      expect(await auth.adminFetch('/admin/events')).toBe(response);
      await auth.signIn();
      await auth.signOut();
      expect(client.adminFetch).toHaveBeenCalledWith(
        '/admin/events',
        undefined,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(oidc.getUser).not.toHaveBeenCalled();
    } finally {
      auth.configureAuthClient(null);
      vi.unstubAllGlobals();
    }
  });
});
