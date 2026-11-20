import type { CanonicalOrigin } from '@nennbox/core';
import type { Database } from './database.js';

export interface PublicRegistrationDependencies {
  db: Database;
  options: { tokenTtlMs?: number };
  canonicalOrigin: CanonicalOrigin;
  hashToken: (token: string) => string;
}
