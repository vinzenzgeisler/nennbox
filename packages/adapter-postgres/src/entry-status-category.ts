import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { entries } from './schema/entries.js';

/** Resolve only the entry's pinned, tenant-owned revision; unknown keys raise. */
export function entryStatusCategory(
  organization: SQLWrapper = entries.organizationId,
  revision: SQLWrapper = entries.workflowRevisionId,
  status: SQLWrapper = entries.acceptanceStatus,
): SQL<string> {
  return sql<string>`entry_status_category(${organization}, ${revision}, ${status})`;
}
