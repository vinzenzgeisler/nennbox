import type { Database } from './database.js';

import type {
  MembershipRepository,
  MembershipBootstrap,
  ExternalIdentity,
} from '@nennbox/core';

import { sql } from 'drizzle-orm';

import {
  userIdentities,
  organizationMemberships,
} from './schema/organization.js';

import { eq, and } from 'drizzle-orm';

import { permissionsForRole, isMembershipRole } from '@nennbox/core';

export function createMembershipRepository(db: Database): MembershipRepository {
  return {
    recordSignIn: async (identity, orgId) => {
      const [user] = await db
        .select({ id: userIdentities.id })
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.issuer, identity.issuer),
            eq(userIdentities.subject, identity.subject),
          ),
        );
      if (!user) return false;
      const rows = await db
        .update(organizationMemberships)
        .set({ lastSignedInAt: new Date() })
        .where(
          and(
            eq(organizationMemberships.organizationId, orgId),
            eq(organizationMemberships.userIdentityId, user.id),
            eq(organizationMemberships.status, 'active'),
          ),
        )
        .returning({ id: organizationMemberships.userIdentityId });
      return rows.length === 1;
    },
    resolvePermissions: async (
      identity: ExternalIdentity,
      orgId,
      bootstrap?: MembershipBootstrap,
    ) =>
      db.transaction(async (tx) => {
        const isBootstrapCandidate =
          bootstrap?.issuer === identity.issuer &&
          (bootstrap.subject === identity.subject ||
            (bootstrap.email?.toLowerCase() === identity.email?.toLowerCase() &&
              identity.emailVerified === true));
        if (isBootstrapCandidate) {
          // Serialize first-admin attempts per organization. Disabled memberships
          // still count as history and must permanently close bootstrap.
          await tx.execute(
            // legacy identifier, intentionally unchanged (#99)
            sql`select pg_advisory_xact_lock(hashtextextended(${`nennbox.membership.bootstrap:${orgId}`}, 0))`,
          );
        }
        const [stored] = await tx
          .insert(userIdentities)
          .values({
            issuer: identity.issuer,
            subject: identity.subject,
            email: identity.email ?? null,
            emailVerified: identity.emailVerified ?? false,
            displayName: identity.displayName ?? null,
          })
          .onConflictDoUpdate({
            target: [userIdentities.issuer, userIdentities.subject],
            set: {
              ...(identity.email !== undefined
                ? { email: identity.email }
                : {}),
              ...(identity.emailVerified !== undefined
                ? { emailVerified: identity.emailVerified }
                : {}),
              ...(identity.displayName !== undefined
                ? { displayName: identity.displayName }
                : {}),
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!stored) return new Set<string>();
        if (isBootstrapCandidate) {
          const [existingMembership] = await tx
            .select({ userIdentityId: organizationMemberships.userIdentityId })
            .from(organizationMemberships)
            .where(eq(organizationMemberships.organizationId, orgId))
            .limit(1);
          if (!existingMembership) {
            await tx
              .insert(organizationMemberships)
              .values({
                organizationId: orgId,
                userIdentityId: stored.id,
                role: 'admin',
                status: 'active',
              })
              .onConflictDoNothing();
          }
        }
        const [membership] = await tx
          .select({ role: organizationMemberships.role })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, orgId),
              eq(organizationMemberships.userIdentityId, stored.id),
              eq(organizationMemberships.status, 'active'),
            ),
          );
        if (!membership) return new Set<string>();
        if (!isMembershipRole(membership.role) && membership.role !== 'member')
          return new Set<string>();
        return permissionsForRole(membership.role);
      }),
  };
}
