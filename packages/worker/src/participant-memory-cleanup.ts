import {
  createParticipantMemoryCleanup,
  organizations,
  type Database,
} from '@nennbox/adapter-postgres';
import {
  assertParticipantMemoryRetention,
  defaultParticipantMemoryRetention,
  type ParticipantMemoryRetention,
} from '@nennbox/core';

/**
 * Hourly retention sweep. One organization at a time, short batches, no table
 * locks; a failing tenant is reported and does not stop the others.
 */
export function createParticipantMemoryCleanupTask(deps: {
  db: Database;
  communityOrganizationId?: string;
  retention?: ParticipantMemoryRetention;
  onTenantError?: (organizationId: string, error: unknown) => void;
}) {
  const cleanup = createParticipantMemoryCleanup(
    deps.db,
    assertParticipantMemoryRetention(
      deps.retention ?? defaultParticipantMemoryRetention,
    ),
  );
  return async () => {
    const tenantIds = deps.communityOrganizationId
      ? [deps.communityOrganizationId]
      : (
          await deps.db.select({ id: organizations.id }).from(organizations)
        ).map((organization) => organization.id);
    const failures: unknown[] = [];
    for (const tenantId of tenantIds)
      try {
        await cleanup.cleanupOrganization(tenantId);
      } catch (error) {
        failures.push(error);
        deps.onTenantError?.(tenantId, error);
      }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Participant memory cleanup failed for some organizations',
      );
  };
}

/** Same three variables as the API, so both sides clamp to identical bounds. */
export function parseParticipantMemoryRetention(
  env: Record<string, string | undefined>,
): ParticipantMemoryRetention {
  const read = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer`);
    return value;
  };
  return assertParticipantMemoryRetention({
    defaultDays: read(
      'PARTICIPANT_MEMORY_RETENTION_DEFAULT_DAYS',
      defaultParticipantMemoryRetention.defaultDays,
    ),
    minimumDays: read(
      'PARTICIPANT_MEMORY_RETENTION_MINIMUM_DAYS',
      defaultParticipantMemoryRetention.minimumDays,
    ),
    maximumDays: read(
      'PARTICIPANT_MEMORY_RETENTION_MAXIMUM_DAYS',
      defaultParticipantMemoryRetention.maximumDays,
    ),
  });
}
