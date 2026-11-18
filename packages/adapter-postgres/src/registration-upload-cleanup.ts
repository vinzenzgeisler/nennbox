import { sql } from 'drizzle-orm';
import type { Database } from './database.js';

export interface RegistrationUploadCleanupObject {
  readonly organizationId: string;
  readonly objectId: string;
}

/**
 * Durable storage-delete outbox. Upload rows are atomically replaced by these
 * tombstones before touching storage, so failures can be retried indefinitely.
 */
export function createRegistrationUploadCleanupRepository(db: Database) {
  return {
    enqueueExpired: async (
      organizationId: string,
      cutoff: Date,
      limit: number,
    ): Promise<number> =>
      db.transaction(async (tx) => {
        const removed = await tx.execute(sql`
          WITH candidates AS (
            SELECT id, organization_id, object_id
            FROM registration_form_upload
            WHERE organization_id = ${organizationId}
              AND registration_group_id IS NULL
              AND expires_at <= now()
              AND created_at <= ${cutoff}
            ORDER BY expires_at, id
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          ), deleted AS (
            DELETE FROM registration_form_upload upload
            USING candidates
            WHERE upload.id = candidates.id
            RETURNING upload.organization_id, upload.object_id
          )
          INSERT INTO registration_upload_cleanup (organization_id, object_id)
          SELECT organization_id, object_id FROM deleted
          ON CONFLICT (organization_id, object_id) DO NOTHING
          RETURNING object_id
        `);
        return removed.rowCount ?? 0;
      }),

    claimPending: async (
      organizationId: string,
      limit: number,
      leaseMs: number,
    ): Promise<RegistrationUploadCleanupObject[]> => {
      const claimed = await db.execute(sql`
        WITH candidates AS (
          SELECT organization_id, object_id
          FROM registration_upload_cleanup
          WHERE organization_id = ${organizationId}
            AND (claimed_until IS NULL OR claimed_until < now())
          ORDER BY created_at, object_id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE registration_upload_cleanup cleanup
        SET claimed_until = now() + (${leaseMs}::text || ' milliseconds')::interval
        FROM candidates
        WHERE cleanup.organization_id = candidates.organization_id
          AND cleanup.object_id = candidates.object_id
        RETURNING cleanup.organization_id AS "organizationId",
          cleanup.object_id AS "objectId"
      `);
      return claimed.rows as unknown as RegistrationUploadCleanupObject[];
    },

    complete: async (organizationId: string, objectId: string) => {
      await db.execute(sql`
        DELETE FROM registration_upload_cleanup
        WHERE organization_id = ${organizationId} AND object_id = ${objectId}
      `);
    },

    release: async (organizationId: string, objectId: string) => {
      await db.execute(sql`
        UPDATE registration_upload_cleanup
        SET claimed_until = NULL
        WHERE organization_id = ${organizationId} AND object_id = ${objectId}
      `);
    },
  };
}
