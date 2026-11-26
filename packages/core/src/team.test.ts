import { describe, expect, it } from 'vitest';
import { permissionsForRole, membershipRoles } from './providers.js';
const read = [
  'organization:read',
  'event:read',
  'entry:read',
  'payment:read',
  'timing:read',
];
const writes = {
  admin: [
    'organization:update',
    'event:write',
    'class:write',
    'entry:write',
    'entry:inspect',
    'payment:write',
    'timing:record',
    'timing:correct',
    'timing:publish',
  ],
  office: ['entry:write', 'entry:inspect'],
  cashier: ['payment:write'],
  scrutineer: ['entry:inspect'],
  viewer: [],
};
describe('canonical team roles', () => {
  it.each(membershipRoles)(
    '%s grants exactly the documented permissions',
    (role) => {
      expect([...permissionsForRole(role)].sort()).toEqual(
        [...read, ...writes[role], 'role:' + role].sort(),
      );
    },
  );
  it('returns independent sets so callers cannot change another request', () => {
    (permissionsForRole('viewer') as Set<string>).add('role:admin');
    expect(permissionsForRole('viewer').has('role:admin')).toBe(false);
  });
});
