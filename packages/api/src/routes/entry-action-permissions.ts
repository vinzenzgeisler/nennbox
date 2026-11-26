/** Shared by action discovery and the corresponding mutation endpoints. */
export const entryActionPermissions = {
  admin: 'entry:write',
  acceptance: 'entry:write',
  message: 'entry:write',
  startNumber: 'entry:write',
  passenger: 'entry:write',
} as const;
