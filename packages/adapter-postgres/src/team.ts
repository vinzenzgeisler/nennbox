import { normalizeTeamEmail } from '@nennbox/core';
import { deriveTeamInvitationToken } from './team-token.js';
import { teamGuards, teamFailure as fail } from './team-support.js';
import { randomBytes, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  defaultInvitationLifetime,
  isMembershipRole,
  resolveCanonicalOrigin,
  type TeamRepository,
  type RequestContext,
  type InvitationLifetime,
  type CanonicalOrigin,
} from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import {
  organizationMemberships,
  userIdentities,
} from './schema/organization.js';
import { teamHistory, teamInvitations } from './team-schema.js';
import { enqueueMailOutbox } from './mail-outbox.js';

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export function createTeamRepository(
  db: Database,
  options: {
    canonicalOrigin?: CanonicalOrigin;
    lifetime?: InvitationLifetime;
    tokenKey?: string;
  } = {},
): TeamRepository {
  const lifetime = options.lifetime ?? defaultInvitationLifetime;
  if (
    ![
      lifetime.minimumSeconds,
      lifetime.defaultSeconds,
      lifetime.maximumSeconds,
    ].every(Number.isSafeInteger) ||
    lifetime.minimumSeconds < 1 ||
    lifetime.defaultSeconds < lifetime.minimumSeconds ||
    lifetime.maximumSeconds < lifetime.defaultSeconds
  )
    throw new Error('Invalid invitation lifetime');
  const { audit, lock, admin, scope, pending } = teamGuards();
  const send = async (
    tx: TransactionDatabase,
    ctx: RequestContext,
    invitation: typeof teamInvitations.$inferSelect,
    nonce: string,
  ) => {
    const token = deriveTeamInvitationToken(options.tokenKey, nonce);
    const origin =
      options.canonicalOrigin &&
      (await resolveCanonicalOrigin(options.canonicalOrigin, ctx));
    if (!origin) return fail('not_configured');
    await enqueueMailOutbox(
      db,
      ctx.organizationId,
      {
        templateKey: 'team-invitation',
        templateVersion: 1,
        locale: 'de',
        recipient: invitation.email,
        idempotencyKey: `team:${invitation.id}:${digest(token)}`,
        variables: {
          invitationNonce: nonce,
          role: invitation.role,
        },
      },
      tx,
    );
  };
  return {
    list: (ctx) =>
      db.transaction(async (tx) => {
        await admin(tx, ctx);
        const members = await tx
          .select({
            id: userIdentities.id,
            email: userIdentities.email,
            displayName: userIdentities.displayName,
            role: organizationMemberships.role,
            status: organizationMemberships.status,
            updatedAt: organizationMemberships.updatedAt,
            lastSignedInAt: organizationMemberships.lastSignedInAt,
          })
          .from(organizationMemberships)
          .innerJoin(
            userIdentities,
            eq(userIdentities.id, organizationMemberships.userIdentityId),
          )
          .where(
            eq(organizationMemberships.organizationId, ctx.organizationId),
          );
        const invitations = await tx
          .select({
            id: teamInvitations.id,
            email: teamInvitations.email,
            role: teamInvitations.role,
            expiresAt: teamInvitations.expiresAt,
            revokedAt: teamInvitations.revokedAt,
            redeemedAt: teamInvitations.redeemedAt,
          })
          .from(teamInvitations)
          .where(eq(teamInvitations.organizationId, ctx.organizationId));
        const history = await tx
          .select()
          .from(teamHistory)
          .where(eq(teamHistory.organizationId, ctx.organizationId));
        return { members, invitations, history };
      }),
    invite: (ctx, input) =>
      db.transaction(async (tx) => {
        await admin(tx, ctx);
        const seconds = input.lifetimeSeconds ?? lifetime.defaultSeconds;
        const email = normalizeTeamEmail(input.email);
        if (
          !isMembershipRole(input.role) ||
          !Number.isSafeInteger(seconds) ||
          seconds < lifetime.minimumSeconds ||
          seconds > lifetime.maximumSeconds
        )
          return fail('invalid_input');
        const nonce = randomBytes(32).toString('base64url');
        const token = deriveTeamInvitationToken(options.tokenKey, nonce);
        const [invitation] = await tx
          .insert(teamInvitations)
          .values({
            organizationId: ctx.organizationId,
            email,
            role: input.role,
            tokenHash: digest(token),
            expiresAt: new Date(Date.now() + seconds * 1000),
          })
          .returning();
        await send(tx, ctx, invitation!, nonce);
        await audit(tx, ctx, 'invited', invitation!.id, {
          email,
          role: input.role,
        });
        return invitation!.id;
      }),
    revoke: (ctx, id) =>
      db.transaction(async (tx) => {
        await admin(tx, ctx);
        await pending(tx, ctx, id);
        await tx
          .update(teamInvitations)
          .set({ revokedAt: new Date() })
          .where(scope(ctx, id));
        await audit(tx, ctx, 'invitation_revoked', id);
      }),
    resend: (ctx, id) =>
      db.transaction(async (tx) => {
        await admin(tx, ctx);
        const invitation = await pending(tx, ctx, id);
        const nonce = randomBytes(32).toString('base64url');
        const token = deriveTeamInvitationToken(options.tokenKey, nonce);
        await tx
          .update(teamInvitations)
          .set({ tokenHash: digest(token) })
          .where(scope(ctx, id));
        await send(tx, ctx, invitation, nonce);
        await audit(tx, ctx, 'invitation_resent', id);
      }),
    change: (ctx, id, change) =>
      db.transaction(async (tx) => {
        await admin(tx, ctx);
        const where = and(
          eq(organizationMemberships.organizationId, ctx.organizationId),
          eq(organizationMemberships.userIdentityId, id),
        );
        const [member] = await tx
          .select()
          .from(organizationMemberships)
          .where(where);
        if (!member) return fail('not_found');
        const next = {
          ...member,
          ...(change.kind === 'role'
            ? { role: change.role }
            : { status: change.status }),
        };
        if (
          !isMembershipRole(next.role) ||
          !['active', 'disabled'].includes(next.status)
        )
          return fail('invalid_input');
        if (
          member.role === 'admin' &&
          member.status === 'active' &&
          (next.role !== 'admin' || next.status !== 'active')
        ) {
          const admins = await tx
            .select()
            .from(organizationMemberships)
            .where(
              and(
                eq(organizationMemberships.organizationId, ctx.organizationId),
                eq(organizationMemberships.role, 'admin'),
                eq(organizationMemberships.status, 'active'),
              ),
            );
          if (admins.length <= 1) return fail('conflict');
        }
        await tx
          .update(organizationMemberships)
          .set({ role: next.role, status: next.status, updatedAt: new Date() })
          .where(where);
        await audit(tx, ctx, 'membership_changed', id, {
          before: { role: member.role, status: member.status },
          after: { role: next.role, status: next.status },
        });
      }),
    redeem: (ctx, identity, token) =>
      db.transaction(async (tx) => {
        await lock(tx, ctx);
        if (
          !ctx.subject ||
          ctx.subject.issuer !== identity.issuer ||
          ctx.subject.subject !== identity.subject ||
          !identity.emailVerified ||
          !identity.email ||
          !/^[A-Za-z0-9_-]{43}$/.test(token)
        )
          return fail('forbidden');
        const email = normalizeTeamEmail(identity.email);
        const [invitation] = await tx
          .select()
          .from(teamInvitations)
          .where(
            and(
              eq(teamInvitations.organizationId, ctx.organizationId),
              eq(teamInvitations.tokenHash, digest(token)),
            ),
          );
        if (
          !invitation ||
          invitation.email !== email ||
          invitation.revokedAt ||
          invitation.redeemedAt ||
          invitation.expiresAt <= new Date()
        )
          return fail('forbidden');
        const [user] = await tx
          .insert(userIdentities)
          .values({
            issuer: identity.issuer,
            subject: identity.subject,
            email,
            emailVerified: true,
            displayName: identity.displayName,
          })
          .onConflictDoUpdate({
            target: [userIdentities.issuer, userIdentities.subject],
            set: {
              email,
              emailVerified: true,
              updatedAt: new Date(),
            },
          })
          .returning();
        // An invite cannot silently reactivate or change an existing membership.
        const [existing] = await tx
          .select()
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, ctx.organizationId),
              eq(organizationMemberships.userIdentityId, user!.id),
            ),
          );
        if (existing) return fail('conflict');
        await tx.insert(organizationMemberships).values({
          organizationId: ctx.organizationId,
          userIdentityId: user!.id,
          role: invitation.role,
          status: 'active',
        });
        await tx
          .update(teamInvitations)
          .set({ redeemedAt: new Date() })
          .where(scope(ctx, invitation.id));
        await audit(tx, ctx, 'invitation_redeemed', invitation.id, {
          identityId: user!.id,
          role: invitation.role,
        });
      }),
  };
}
