const tokenKey = 'nennbox.invitation.token';
const loginKey = 'nennbox.invitation.login';

export function isInvitationRoute(): boolean {
  return (
    window.location.pathname === '/invitation' ||
    (window.location.pathname === '/auth/callback' &&
      window.sessionStorage.getItem(loginKey) === 'pending')
  );
}

/** Keep the bearer secret out of requests, referrers, and the OIDC redirect URL. */
export function readInvitationToken(): string | null {
  if (window.location.hash) {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token))
      window.sessionStorage.setItem(tokenKey, token);
    else window.sessionStorage.removeItem(tokenKey);
  }
  return window.sessionStorage.getItem(tokenKey);
}

export function markInvitationLogin(): void {
  window.sessionStorage.setItem(loginKey, 'pending');
}

export function clearInvitation(): void {
  window.sessionStorage.removeItem(tokenKey);
  window.sessionStorage.removeItem(loginKey);
}
