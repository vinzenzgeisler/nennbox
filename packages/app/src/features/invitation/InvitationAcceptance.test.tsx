// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAuthClient } from '../../auth.js';
import { App } from '../../App.js';
import { markInvitationLogin } from './invitation-session.js';

const token = 'a'.repeat(43);
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const client = {
  restoreAdminSession: vi.fn().mockResolvedValue('ready'),
  restoreInvitationSession: vi.fn().mockResolvedValue('ready'),
  redeemInvitation: vi.fn().mockResolvedValue(undefined),
  signIn: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  getAdminIdentity: () => ({ name: 'Eva Beispiel', role: 'Angemeldet' }),
  adminFetch: vi.fn(),
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  window.sessionStorage.clear();
  configureAuthClient(client);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  configureAuthClient(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
const mount = () =>
  act(async () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
const button = (name: string) =>
  [...container.querySelectorAll('button')].find(
    (item) => item.textContent === name,
  )!;

describe('temporary invitation page', () => {
  it('removes the fragment, does not bootstrap the app or redeem on opening, and requires consent', async () => {
    window.history.replaceState(null, '', `/invitation#token=${token}`);
    await mount();
    expect(window.location.hash).toBe('');
    expect(container.textContent).toContain('Vorläufige Einladungsseite');
    expect(container.textContent).toContain('Eva Beispiel');
    expect(client.restoreAdminSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(client.redeemInvitation).not.toHaveBeenCalled();
    await act(async () => button('Einladung annehmen').click());
    expect(client.redeemInvitation).toHaveBeenCalledExactlyOnceWith(token);
    expect(container.textContent).toContain('Die Einladung wurde angenommen.');
    expect(window.sessionStorage.length).toBe(0);
  });
  it('preserves the token through login and routes the callback outside the admin shell', async () => {
    client.restoreInvitationSession.mockResolvedValueOnce('signed-out');
    window.history.replaceState(null, '', `/invitation#token=${token}`);
    // Avoid StrictMode remount in this signed-out case to keep the mocked state stable.
    await act(async () => root.render(<App />));
    await act(async () => button('Anmelden').click());
    expect(client.signIn).toHaveBeenCalledOnce();
    expect(client.redeemInvitation).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(container);
    window.history.replaceState(
      null,
      '',
      '/auth/callback?code=opaque&state=opaque',
    );
    await mount();
    expect(button('Einladung annehmen')).toBeDefined();
    expect(client.restoreAdminSession).not.toHaveBeenCalled();
    expect(client.redeemInvitation).not.toHaveBeenCalled();
  });
  it('reports invalid links without attempting authentication', async () => {
    window.history.replaceState(null, '', '/invitation#token=short');
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'ungültig',
    );
    expect(client.restoreInvitationSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });
  it('keeps the invitation available after a rejected explicit acceptance', async () => {
    window.history.replaceState(null, '', `/invitation#token=${token}`);
    markInvitationLogin();
    client.redeemInvitation.mockRejectedValueOnce(
      new Error('Einladung abgelaufen'),
    );
    await mount();
    await act(async () => button('Einladung annehmen').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Einladung abgelaufen',
    );
    expect(button('Einladung annehmen').disabled).toBe(false);
  });
});
