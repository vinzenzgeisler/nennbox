import {
  createRegistrationUploadCleanupRepository,
  organizations,
  type Database,
} from '@racepilot/adapter-postgres';
import { organizationId, type ObjectStorageProvider } from '@racepilot/core';

const BATCH_SIZE = 100;
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Periodic system maintenance, scoped to one organization per repository call. */
export function createRegistrationUploadCleanupTask(deps: {
  db: Database;
  storage: ObjectStorageProvider;
  communityOrganizationId?: string;
  retentionDays: number;
}) {
  const repository = createRegistrationUploadCleanupRepository(deps.db);
  return async () => {
    const tenantIds = deps.communityOrganizationId
      ? [deps.communityOrganizationId]
      : (await deps.db.select({ id: organizations.id }).from(organizations)).map(
          (organization) => organization.id,
        );
    const cutoff = new Date(
      Date.now() - deps.retentionDays * 24 * 60 * 60 * 1000,
    );

    for (const tenantId of tenantIds) {
      await repository.enqueueExpired(tenantId, cutoff, BATCH_SIZE);
      const pending = await repository.claimPending(
        tenantId,
        BATCH_SIZE,
        CLAIM_LEASE_MS,
      );
      for (const object of pending) {
        try {
          // Adapters derive the physical key from organizationId; never accept a
          // caller-supplied storage path or operate across tenant prefixes.
          await deps.storage.delete(
            organizationId(object.organizationId),
            object.objectId,
          );
          await repository.complete(object.organizationId, object.objectId);
        } catch (error) {
          await repository.release(object.organizationId, object.objectId);
          throw error;
        }
      }
    }
  };
}

export function parseRegistrationUploadRetentionDays(value: string | undefined) {
  const days = value === undefined ? 7 : Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365)
    throw new Error('REGISTRATION_UPLOAD_RETENTION_DAYS must be an integer from 1 to 365');
  return days;
}
