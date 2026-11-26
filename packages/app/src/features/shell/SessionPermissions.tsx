import { createContext, useContext } from 'react';
import { TeamRoleSchema, teamRoles } from '@nennbox/contracts';

export const SessionPermissions = createContext<readonly string[]>([]);

/** Confirmed server permissions take precedence, including an explicitly empty set.
 * Older servers expose only the role; use the shared contract during upgrades.
 */
export function sessionPermissions(session: {
  role: string;
  permissions?: string[];
}): readonly string[] {
  if (session.permissions) return session.permissions;
  const role = TeamRoleSchema.safeParse(session.role);
  return role.success
    ? [`role:${role.data}`, ...teamRoles[role.data].permissions]
    : [];
}

export function useSessionPermission(permission: string): boolean {
  return useContext(SessionPermissions).includes(permission);
}
