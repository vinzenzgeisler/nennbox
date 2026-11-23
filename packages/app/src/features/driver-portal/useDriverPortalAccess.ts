import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from './driverPortalTypes.js';

export const portalUrl = '/public/driver-portal';
class HttpError extends Error {
  constructor(readonly status: number) {
    super('Anfrage fehlgeschlagen');
  }
}
export async function json(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) throw new HttpError(response.status);
  return response.json();
}

export function useDriverPortalAccess() {
  const [phase, setPhase] = useState<
    'loading' | 'request' | 'sent' | 'ready' | 'invalid' | 'error'
  >('loading');
  const [view, setView] = useState<View | null>(null);
  const redeemed = useRef<string | null>(null);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data = (await json(portalUrl)) as View;
      setView(data);
      setPhase('ready');
    } catch (error) {
      setPhase('error');
      throw error;
    }
  }, []);
  const retry = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('loading');
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    try {
      if (token && redeemed.current !== token) {
        try {
          await json(`${portalUrl}/redeem`, 'POST', { token });
          redeemed.current = token;
        } catch (error) {
          setPhase(
            error instanceof HttpError &&
              error.status >= 400 &&
              error.status < 500
              ? 'invalid'
              : 'error',
          );
          return;
        }
        history.replaceState(
          history.state,
          '',
          location.pathname + location.search,
        );
      }
      try {
        await refresh();
      } catch (error) {
        // Only a missing session on the initial visit needs a new link.
        setPhase(
          !redeemed.current &&
            !token &&
            error instanceof HttpError &&
            error.status === 401
            ? 'request'
            : 'error',
        );
      }
    } finally {
      inFlight.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    void retry();
    const openLink = () => void retry();
    window.addEventListener('hashchange', openLink);
    return () => window.removeEventListener('hashchange', openLink);
  }, [retry]);
  return { phase, setPhase, view, setView, refresh, retry };
}
