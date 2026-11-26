import { entryStatusCategory } from './entry-status-category.js';
import { sql } from 'drizzle-orm';
import type { Database } from './database.js';

/**
 * Entries of a registration group that still take part: not deleted, and neither
 * withdrawn nor rejected, judged by the status category of the entry's pinned
 * workflow (custom status keys count by their category).
 */
export async function countActiveEntries(
  db: Pick<Database, 'execute'>,
  organizationId: string,
  registrationGroupId: string,
): Promise<number> {
  const result = (await db.execute(sql`
    select count(*)::int as active from entry e
    left join entry_workflow_revision r on r.organization_id = e.organization_id and r.id = e.workflow_revision_id
    where e.organization_id = ${organizationId}
      and e.registration_group_id = ${registrationGroupId}
      and e.deleted_at is null
      and ${entryStatusCategory(sql`e.organization_id`, sql`e.workflow_revision_id`, sql`e.acceptance_status`)} not in ('withdrawn', 'rejected')`)) as unknown as {
    rows: { active: number }[];
  };
  return Number(result.rows[0]?.active ?? 0);
}
