import type { CanonicalOrigin } from '@nennbox/core';
import type { Database } from './database.js';
import { createDriverPortalAccess } from './driver-portal-access.js';
import { createDriverPortalView } from './driver-portal-view.js';
import { createDriverPortalMutations } from './driver-portal-mutations.js';
const editable = [
  'phone',
  'street',
  'postalCode',
  'city',
  'emergencyContactName',
  'emergencyContactPhone',
  'licenseNumber',
] as const;
export type DriverPortalField = (typeof editable)[number];
export const isDriverPortalField = (
  field: string,
): field is DriverPortalField => editable.includes(field as DriverPortalField);

export function createDriverPortalRepository(
  db: Database,
  canonicalOrigin: CanonicalOrigin,
) {
  const access = createDriverPortalAccess(db, canonicalOrigin);
  return {
    ...access,
    ...createDriverPortalView(db, access.session),
    ...createDriverPortalMutations(db, access.ownsEntry),
  };
}
export type DriverPortalRepository = ReturnType<
  typeof createDriverPortalRepository
>;
