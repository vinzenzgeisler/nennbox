import { and, eq, sql } from 'drizzle-orm';
import { ProviderError, type RequestContext } from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import {
  organizationMemberships,
  userIdentities,
} from './schema/organization.js';
import { teamHistory, teamInvitations } from './team-schema.js';
export const teamFailure = (
  code:
    'forbidden' | 'not_found' | 'conflict' | 'invalid_input' | 'not_configured',
): never => {
  throw new ProviderError(code, code);
};
export function teamGuards() {
  const audit = async (
    tx: TransactionDatabase,
    ctx: RequestContext,
    action: string,
    targetId: string,
    details: unknown = {},
  ) => {
    if (!ctx.subject) return teamFailure('forbidden');
    await tx.insert(teamHistory).values({
      organizationId: ctx.organizationId,
      actorIssuer: ctx.subject.issuer,
      actorSubject: ctx.subject.subject,
      action,
      targetId,
      details,
    });
  };
  const lock = async (tx: TransactionDatabase, ctx: RequestContext) => {
    // Share bootstrap's tenant-scoped lock, never a table lock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`nennbox.membership.bootstrap:${ctx.organizationId}`}, 0))`,
    );
  };
  const admin = async (tx: TransactionDatabase, ctx: RequestContext) => {
    await lock(tx, ctx);
    if (!ctx.subject || !ctx.permissions.has('role:admin'))
      return teamFailure('forbidden');
    // Recheck after acquiring the lock: a concurrent demotion must not retain authority.
    const rows = await tx
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .innerJoin(
        userIdentities,
        eq(userIdentities.id, organizationMemberships.userIdentityId),
      )
      .where(
        and(
          eq(organizationMemberships.organizationId, ctx.organizationId),
          eq(userIdentities.issuer, ctx.subject.issuer),
          eq(userIdentities.subject, ctx.subject.subject),
          eq(organizationMemberships.status, 'active'),
          eq(organizationMemberships.role, 'admin'),
        ),
      );
    if (!rows.length) return teamFailure('forbidden');
  };
  const scope = (ctx: RequestContext, id: string) =>
    and(
      eq(teamInvitations.organizationId, ctx.organizationId),
      eq(teamInvitations.id, id),
    );
  const pending = async (
    tx: TransactionDatabase,
    ctx: RequestContext,
    id: string,
  ) => {
    const [row] = await tx.select().from(teamInvitations).where(scope(ctx, id));
    if (!row) return teamFailure('not_found');
    if (row.revokedAt || row.redeemedAt || row.expiresAt <= new Date())
      return teamFailure('conflict');
    return row;
  };
  return { audit, lock, admin, scope, pending };
}

/** Team history with the acting member's display name. */
export const teamHistoryRows = (
  tx: TransactionDatabase,
  organizationId: string,
) =>
  tx
    .select({
      id: teamHistory.id,
      organizationId: teamHistory.organizationId,
      actorIssuer: teamHistory.actorIssuer,
      actorSubject: teamHistory.actorSubject,
      actorName: userIdentities.displayName,
      action: teamHistory.action,
      targetId: teamHistory.targetId,
      details: teamHistory.details,
      createdAt: teamHistory.createdAt,
    })
    .from(teamHistory)
    .leftJoin(
      userIdentities,
      and(
        eq(userIdentities.issuer, teamHistory.actorIssuer),
        eq(userIdentities.subject, teamHistory.actorSubject),
      ),
    )
    .where(eq(teamHistory.organizationId, organizationId));
