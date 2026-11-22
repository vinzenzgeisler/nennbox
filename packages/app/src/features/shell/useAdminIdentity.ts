import { useEffect, useState } from 'react';
import { adminFetch, getAdminIdentity, type AuthIdentity } from '../../auth.js';

export type ShellIdentity = AuthIdentity & { organization?: string };

/**
 * The signed-in person for the sidebar card: the role from the session and,
 * once known, the organization (e.g. the club) that the app design shows
 * under the name. A failed request keeps the role.
 */
export function useAdminIdentity(): ShellIdentity | null {
  const [identity, setIdentity] = useState<ShellIdentity | null>(
    getAdminIdentity(),
  );
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/session', { cache: 'no-store' })
      .then((response) =>
        response.ok ? (response.json() as Promise<{ role: string }>) : null,
      )
      .then((session) => {
        if (active && (session?.role === 'admin' || session?.role === 'member'))
          setIdentity((current) =>
            current
              ? {
                  ...current,
                  role: session.role === 'admin' ? 'Admin' : 'Mitglied',
                }
              : null,
          );
      })
      .catch(() => undefined);
    void adminFetch('/admin/organization', { cache: 'no-store' })
      .then((response) =>
        response.ok ? (response.json() as Promise<{ name?: unknown }>) : null,
      )
      .then((organization) => {
        const name = organization?.name;
        if (active && typeof name === 'string' && name.trim())
          setIdentity((current) =>
            current ? { ...current, organization: name } : null,
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return identity;
}
