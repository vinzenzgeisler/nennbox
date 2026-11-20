import { eq } from 'drizzle-orm';
import {
  advanceExpiredWaitlistOffers,
  organizations,
  type Database,
} from '@nennbox/adapter-postgres';

export function createWaitlistDeadlineTask(deps: {
  db: Database;
  communityOrganizationId?: string;
}) {
  return async () => {
    const tenantIds = deps.communityOrganizationId
      ? [deps.communityOrganizationId]
      : (
          await deps.db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.status, 'active'))
        ).map((organization) => organization.id);
    for (const organizationId of tenantIds)
      await advanceExpiredWaitlistOffers(deps.db, organizationId);
  };
}
