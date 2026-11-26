import { createHash, randomUUID } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migrateDrizzle } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createRequestContext,
  organizationId,
  permissionsForRole,
  staticCanonicalOrigin,
  type ExternalIdentity,
  type MembershipRole,
  type RequestContext,
} from '@nennbox/core';
import { createDatabase, migrate } from './database-service.js';
import { createMembershipRepository } from './memberships.js';
import { createTeamRepository } from './team.js';
import {
  organizations,
  organizationMemberships,
  userIdentities,
} from './schema/organization.js';
import { teamInvitations, teamHistory } from './team-schema.js';
import { emailOutbox } from './mail-schema.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const migrations = fileURLToPath(new URL('../migrations', import.meta.url));
const origin = staticCanonicalOrigin('https://team.example.test');
const issuer = 'https://identity.example.test';
const without = <T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};
const identity = (
  email = `${randomUUID()}@example.test`,
): ExternalIdentity => ({
  issuer,
  subject: randomUUID(),
  email,
  emailVerified: true,
  displayName: 'Team test',
});
const context = (
  org: string,
  person: ExternalIdentity,
  role: MembershipRole = 'admin',
) =>
  createRequestContext({
    organizationId: organizationId(org),
    deploymentMode: 'community',
    subject: person,
    permissions: permissionsForRole(role),
    capabilities: new Set(),
    correlationId: randomUUID(),
  });

describe.skipIf(!url)(
  'PostgreSQL team authorization and invitation lifecycle',
  () => {
    let first: Awaited<ReturnType<typeof createDatabase>>;
    let second: Awaited<ReturnType<typeof createDatabase>>;
    const orgIds: string[] = [];
    const userIds: string[] = [];
    beforeAll(async () => {
      await migrate(url!);
      await runMigrations({ connectionString: url! });
      first = await createDatabase(url!);
      second = await createDatabase(url!);
    }, 60_000);
    afterAll(async () => {
      if (!first) return;
      try {
        for (const id of orgIds)
          await first.db.delete(organizations).where(eq(organizations.id, id));
        for (const id of userIds)
          await first.db
            .delete(userIdentities)
            .where(eq(userIdentities.id, id));
      } finally {
        await Promise.all([first.pool.end(), second.pool.end()]);
      }
    });
    const repository = () =>
      createTeamRepository(first.db, { canonicalOrigin: origin });
    const seed = async () => {
      const [org] = await first.db
        .insert(organizations)
        .values({
          slug: `team-${randomUUID()}`,
          name: 'Team test',
          timezone: 'Europe/Berlin',
          locale: 'de',
        })
        .returning();
      orgIds.push(org!.id);
      const admin = identity();
      const adminId = await member(org!.id, admin, 'admin');
      return { org: org!.id, admin, adminId, ctx: context(org!.id, admin) };
    };
    const member = async (
      org: string,
      person: ExternalIdentity,
      role: MembershipRole,
    ) => {
      const [user] = await first.db
        .insert(userIdentities)
        .values(person)
        .returning();
      userIds.push(user!.id);
      await first.db.insert(organizationMemberships).values({
        organizationId: org,
        userIdentityId: user!.id,
        role,
        status: 'active',
      });
      return user!.id;
    };
    const invitation = async (
      ctx: RequestContext,
      email: string,
      role: MembershipRole = 'office',
    ) => {
      const id = await repository().invite(ctx, { email, role });
      return { id, token: await tokenFor(id) };
    };
    const tokenFor = async (id: string) => {
      const rows = await first.db
        .select()
        .from(emailOutbox)
        .where(
          eq(emailOutbox.organizationId, (await rowFor(id))!.organizationId),
        );
      const mails = rows.filter((row) =>
        row.idempotencyKey.startsWith(`team:${id}:`),
      );
      // Outbox timestamps are not an ordering guarantee; the persisted hash identifies the current delivery.
      const hash = (await rowFor(id))!.tokenHash;
      const mail = mails.find((row) => {
        const token = new URLSearchParams(
          new URL(row.variables.linkUrl!).hash.slice(1),
        ).get('token')!;
        return createHash('sha256').update(token).digest('hex') === hash;
      });
      expect(mail).toMatchObject({
        templateKey: 'team-invitation',
        locale: 'de',
        status: 'pending',
      });
      const link = new URL(mail!.variables.linkUrl!);
      expect(link.origin + link.pathname).toBe(
        'https://team.example.test/invitation',
      );
      expect(link.search).toBe('');
      const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return token;
    };
    const rowFor = async (id: string) =>
      (
        await first.db
          .select()
          .from(teamInvitations)
          .where(eq(teamInvitations.id, id))
      )[0];
    const redeem = async (
      org: string,
      person: ExternalIdentity,
      token: string,
    ) => {
      // Keep redeemed identities available for cleanup even if redemption creates them.
      try {
        await repository().redeem(
          context(org, person, 'viewer'),
          person,
          token,
        );
      } finally {
        const [user] = await first.db
          .select()
          .from(userIdentities)
          .where(
            and(
              eq(userIdentities.issuer, person.issuer),
              eq(userIdentities.subject, person.subject),
            ),
          );
        if (user && !userIds.includes(user.id)) userIds.push(user.id);
      }
    };

    it('separates members, invitations and history and rejects all cross-tenant mutations', async () => {
      const a = await seed(),
        b = await seed();
      const recipient = identity();
      const foreignMember = await member(b.org, identity(), 'office');
      const invite = await invitation(b.ctx, recipient.email!);
      const before = await repository().list(b.ctx);
      const own = await repository().list(a.ctx);
      expect(own.members.map((row) => row.id)).toEqual([a.adminId]);
      expect(own.invitations).toEqual([]);
      expect(own.history).toEqual([]);
      await expect(
        repository().change(a.ctx, foreignMember, {
          kind: 'role',
          role: 'admin',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        repository().change(a.ctx, foreignMember, {
          kind: 'status',
          status: 'disabled',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(repository().revoke(a.ctx, invite.id)).rejects.toMatchObject(
        { code: 'not_found' },
      );
      await expect(repository().resend(a.ctx, invite.id)).rejects.toMatchObject(
        { code: 'not_found' },
      );
      await expect(
        redeem(a.org, recipient, invite.token),
      ).rejects.toMatchObject({ code: 'forbidden' });
      expect(await repository().list(b.ctx)).toEqual(before);
      expect(await repository().list(a.ctx)).toEqual(own);
      await redeem(b.org, recipient, invite.token);
      expect((await repository().list(b.ctx)).members).toContainEqual(
        expect.objectContaining({ email: recipient.email, role: 'office' }),
      );
    });

    it('stores only a token digest and never exposes tokens or digests in list/history', async () => {
      const a = await seed();
      const started = Date.now();
      const invite = await invitation(
        a.ctx,
        '  Mixed.Case@Example.Test  ',
        'cashier',
      );
      const row = (await rowFor(invite.id))!;
      expect(row.email).toBe('mixed.case@example.test');
      expect(row.tokenHash).toBe(
        createHash('sha256').update(invite.token).digest('hex'),
      );
      expect(row.tokenHash).not.toBe(invite.token);
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
        started + 7 * 86400_000,
      );
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 7 * 86400_000,
      );
      const snapshot = await repository().list(a.ctx);
      expect(snapshot.invitations).toContainEqual(
        expect.objectContaining({
          id: invite.id,
          email: row.email,
          role: 'cashier',
        }),
      );
      expect(JSON.stringify(snapshot)).not.toContain(invite.token);
      expect(JSON.stringify(snapshot)).not.toContain(row.tokenHash);
      expect(snapshot.invitations[0]).not.toHaveProperty('token');
      expect(snapshot.invitations[0]).not.toHaveProperty('tokenHash');
      const person = identity('MIXED.CASE@example.test');
      await redeem(a.org, person, invite.token);
      const permissions = await createMembershipRepository(
        first.db,
      ).resolvePermissions(person, organizationId(a.org));
      expect(permissions).toEqual(permissionsForRole('cashier'));
    });

    it('resend rotates the secret and invalidates the original without changing expiry', async () => {
      const a = await seed(),
        person = identity();
      const invite = await invitation(a.ctx, person.email!);
      const before = (await rowFor(invite.id))!;
      await repository().resend(a.ctx, invite.id);
      const replacement = await tokenFor(invite.id);
      expect(replacement).not.toBe(invite.token);
      expect((await rowFor(invite.id))!.expiresAt).toEqual(before.expiresAt);
      await expect(redeem(a.org, person, invite.token)).rejects.toMatchObject({
        code: 'forbidden',
      });
      expect((await rowFor(invite.id))!.redeemedAt).toBeNull();
      await redeem(a.org, person, replacement);
      await expect(repository().resend(a.ctx, invite.id)).rejects.toMatchObject(
        { code: 'conflict' },
      );
      await expect(repository().revoke(a.ctx, invite.id)).rejects.toMatchObject(
        { code: 'conflict' },
      );
    });

    it.each(['expired', 'revoked'] as const)(
      'rejects %s invitations, including resend, without membership or redemption',
      async (state) => {
        const a = await seed(),
          person = identity();
        const invite = await invitation(a.ctx, person.email!);
        if (state === 'expired')
          await first.db
            .update(teamInvitations)
            .set({ expiresAt: new Date(Date.now() - 1_000) })
            .where(eq(teamInvitations.id, invite.id));
        else await repository().revoke(a.ctx, invite.id);
        await expect(redeem(a.org, person, invite.token)).rejects.toMatchObject(
          { code: 'forbidden' },
        );
        await expect(
          repository().resend(a.ctx, invite.id),
        ).rejects.toMatchObject({ code: 'conflict' });
        await expect(
          repository().revoke(a.ctx, invite.id),
        ).rejects.toMatchObject({ code: 'conflict' });
        expect((await rowFor(invite.id))!.redeemedAt).toBeNull();
        expect((await repository().list(a.ctx)).members).toHaveLength(1);
        expect(
          await createMembershipRepository(first.db).resolvePermissions(
            person,
            organizationId(a.org),
          ),
        ).toEqual(new Set());
        const [stored] = await first.db
          .select()
          .from(userIdentities)
          .where(eq(userIdentities.subject, person.subject));
        if (stored) userIds.push(stored.id);
      },
    );

    it('rejects email mismatch, unverified identity, subject/issuer mismatch, missing subject and malformed tokens without consuming the invitation', async () => {
      const a = await seed(),
        person = identity();
      const invite = await invitation(a.ctx, person.email!);
      const ctx = context(a.org, person, 'viewer');
      const cases: Array<[RequestContext, ExternalIdentity, string]> = [
        [ctx, { ...person, email: 'someone-else@example.test' }, invite.token],
        [ctx, { ...person, emailVerified: false }, invite.token],
        [ctx, without(person, 'emailVerified'), invite.token],
        [ctx, without(person, 'email'), invite.token],
        [ctx, { ...person, subject: randomUUID() }, invite.token],
        [
          ctx,
          { ...person, issuer: 'https://other.example.test' },
          invite.token,
        ],
        [without(ctx, 'subject'), person, invite.token],
        [ctx, person, 'malformed'],
        [ctx, person, 'A'.repeat(43)],
      ];
      for (const [request, actor, token] of cases) {
        await expect(
          repository().redeem(request, actor, token),
        ).rejects.toMatchObject({ code: 'forbidden' });
        expect((await rowFor(invite.id))!.redeemedAt).toBeNull();
      }
      expect((await repository().list(a.ctx)).members).toHaveLength(1);
      await redeem(a.org, person, invite.token);
      await expect(redeem(a.org, person, invite.token)).rejects.toMatchObject({
        code: 'forbidden',
      });
      expect((await repository().list(a.ctx)).members).toHaveLength(2);
      expect(
        (await repository().list(a.ctx)).history.filter(
          (row) => row.action === 'invitation_redeemed',
        ),
      ).toHaveLength(1);
    });

    it('serializes simultaneous redemption on independent connections to exactly one membership and one audit event', async () => {
      const a = await seed(),
        person = identity();
      const invite = await invitation(a.ctx, person.email!, 'scrutineer');
      const ctx = context(a.org, person, 'viewer');
      const results = await Promise.allSettled([
        repository().redeem(ctx, person, invite.token),
        createTeamRepository(second.db, { canonicalOrigin: origin }).redeem(
          ctx,
          person,
          invite.token,
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toEqual([
        expect.objectContaining({
          reason: expect.objectContaining({ code: 'forbidden' }),
        }),
      ]);
      const snapshot = await repository().list(a.ctx);
      const users = snapshot.members.filter(
        (row) => row.email === person.email,
      );
      expect(users).toHaveLength(1);
      userIds.push(users[0]!.id as string);
      expect(users[0]).toMatchObject({ role: 'scrutineer', status: 'active' });
      expect(
        snapshot.history.filter((row) => row.action === 'invitation_redeemed'),
      ).toHaveLength(1);
      expect((await rowFor(invite.id))!.redeemedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite or reactivate an existing membership when redeeming a new invitation', async () => {
      const a = await seed(),
        person = identity();
      const id = await member(a.org, person, 'viewer');
      await repository().change(a.ctx, id, {
        kind: 'status',
        status: 'disabled',
      });
      const invite = await invitation(a.ctx, person.email!, 'admin');
      await expect(redeem(a.org, person, invite.token)).rejects.toMatchObject({
        code: 'conflict',
      });
      expect((await repository().list(a.ctx)).members).toContainEqual(
        expect.objectContaining({ id, role: 'viewer', status: 'disabled' }),
      );
      expect((await rowFor(invite.id))!.redeemedAt).toBeNull();
    });

    it('protects the last active administrator from demotion and deactivation', async () => {
      const a = await seed();
      const disabledAdmin = await member(a.org, identity(), 'admin');
      await repository().change(a.ctx, disabledAdmin, {
        kind: 'status',
        status: 'disabled',
      });
      await expect(
        repository().change(a.ctx, a.adminId, { kind: 'role', role: 'viewer' }),
      ).rejects.toMatchObject({ code: 'conflict' });
      await expect(
        repository().change(a.ctx, a.adminId, {
          kind: 'status',
          status: 'disabled',
        }),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect((await repository().list(a.ctx)).members).toContainEqual(
        expect.objectContaining({
          id: a.adminId,
          role: 'admin',
          status: 'active',
        }),
      );
    });

    it.each(['role', 'status'] as const)(
      'keeps an active admin when two admins concurrently change each other: %s',
      async (kind) => {
        const a = await seed(),
          other = identity();
        const otherId = await member(a.org, other, 'admin');
        const otherContext = context(a.org, other);
        const change =
          kind === 'role'
            ? { kind, role: 'viewer' as const }
            : { kind, status: 'disabled' as const };
        const results = await Promise.allSettled([
          repository().change(a.ctx, otherId, change),
          createTeamRepository(second.db, { canonicalOrigin: origin }).change(
            otherContext,
            a.adminId,
            change,
          ),
        ]);
        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
          results.filter((result) => result.status === 'rejected'),
        ).toEqual([
          expect.objectContaining({
            reason: expect.objectContaining({ code: 'forbidden' }),
          }),
        ]);
        const rows = await first.db
          .select()
          .from(organizationMemberships)
          .where(eq(organizationMemberships.organizationId, a.org));
        expect(
          rows.filter((row) => row.role === 'admin' && row.status === 'active'),
        ).toHaveLength(1);
        expect(
          await first.db
            .select()
            .from(teamHistory)
            .where(eq(teamHistory.organizationId, a.org)),
        ).toHaveLength(1);
      },
    );

    it('resolves role changes and deactivation/reactivation immediately for the same ongoing identity/session', async () => {
      const a = await seed(),
        person = identity();
      const id = await member(a.org, person, 'office');
      const memberships = createMembershipRepository(first.db);
      const resolve = () =>
        memberships.resolvePermissions(person, organizationId(a.org));
      expect(await resolve()).toEqual(permissionsForRole('office'));
      await repository().change(a.ctx, id, { kind: 'role', role: 'cashier' });
      expect(await resolve()).toEqual(permissionsForRole('cashier'));
      expect(await resolve()).not.toContain('entry:write');
      await repository().change(a.ctx, id, {
        kind: 'status',
        status: 'disabled',
      });
      expect(await resolve()).toEqual(new Set());
      await repository().change(a.ctx, id, {
        kind: 'status',
        status: 'active',
      });
      expect(await resolve()).toEqual(permissionsForRole('cashier'));
    });

    it('rejects non-admin, stale-admin, forged-admin and anonymous operations with no persisted side effects', async () => {
      const a = await seed(),
        person = identity();
      const id = await member(a.org, person, 'viewer');
      const invite = await invitation(a.ctx, identity().email!);
      for (const role of [
        'office',
        'cashier',
        'scrutineer',
        'viewer',
      ] as const) {
        const ctx = context(a.org, person, role);
        await expect(repository().list(ctx)).rejects.toMatchObject({
          code: 'forbidden',
        });
      }
      const oldAdmin = identity();
      const oldId = await member(a.org, oldAdmin, 'admin');
      const stale = context(a.org, oldAdmin);
      await repository().change(a.ctx, oldId, { kind: 'role', role: 'viewer' });
      const disabled = identity();
      const disabledId = await member(a.org, disabled, 'admin');
      await repository().change(a.ctx, disabledId, {
        kind: 'status',
        status: 'disabled',
      });
      const before = await repository().list(a.ctx);
      for (const request of [
        context(a.org, person, 'viewer'),
        context(a.org, person),
        stale,
        context(a.org, disabled),
        context(a.org, identity()),
        without(a.ctx, 'subject'),
      ]) {
        await expect(repository().list(request)).rejects.toMatchObject({
          code: 'forbidden',
        });
        await expect(
          repository().invite(request, {
            email: identity().email!,
            role: 'admin',
          }),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(
          repository().change(request, id, { kind: 'role', role: 'admin' }),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(
          repository().revoke(request, invite.id),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(
          repository().resend(request, invite.id),
        ).rejects.toMatchObject({ code: 'forbidden' });
      }
      expect(await repository().list(a.ctx)).toEqual(before);
    });

    it('records actor, target, action, time and membership before/after without secrets', async () => {
      const a = await seed(),
        person = identity(),
        revoked = identity();
      const start = Date.now();
      const invite = await invitation(a.ctx, person.email!, 'office');
      await repository().resend(a.ctx, invite.id);
      const replacement = await tokenFor(invite.id);
      await redeem(a.org, person, replacement);
      const snapshot = await repository().list(a.ctx);
      const user = snapshot.members.find((row) => row.email === person.email)!;
      await repository().change(a.ctx, user.id as string, {
        kind: 'role',
        role: 'cashier',
      });
      await repository().change(a.ctx, user.id as string, {
        kind: 'status',
        status: 'disabled',
      });
      const revokedInvite = await invitation(a.ctx, revoked.email!);
      await repository().revoke(a.ctx, revokedInvite.id);
      const history = (await repository().list(a.ctx)).history;
      expect(history).toHaveLength(7);
      for (const row of history) {
        expect(row.organizationId).toBe(a.org);
        const actor = row.action === 'invitation_redeemed' ? person : a.admin;
        expect(row).toMatchObject({
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
        });
        expect(row.createdAt).toBeInstanceOf(Date);
        expect((row.createdAt as Date).getTime()).toBeGreaterThanOrEqual(
          start - 1_000,
        );
        expect((row.createdAt as Date).getTime()).toBeLessThanOrEqual(
          Date.now(),
        );
      }
      expect(history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'invited',
            targetId: invite.id,
            details: { email: person.email, role: 'office' },
          }),
          expect.objectContaining({
            action: 'invitation_resent',
            targetId: invite.id,
          }),
          expect.objectContaining({
            action: 'invitation_redeemed',
            targetId: invite.id,
            details: { identityId: user.id, role: 'office' },
          }),
          expect.objectContaining({
            action: 'membership_changed',
            targetId: user.id,
            details: {
              before: { role: 'office', status: 'active' },
              after: { role: 'cashier', status: 'active' },
            },
          }),
          expect.objectContaining({
            action: 'membership_changed',
            targetId: user.id,
            details: {
              before: { role: 'cashier', status: 'active' },
              after: { role: 'cashier', status: 'disabled' },
            },
          }),
          expect.objectContaining({
            action: 'invitation_revoked',
            targetId: revokedInvite.id,
          }),
        ]),
      );
      expect(JSON.stringify(history)).not.toContain(invite.token);
      expect(JSON.stringify(history)).not.toContain(replacement);
    });

    it('validates invitation lifetime and rolls back invitations when mail is not configured', async () => {
      const a = await seed();
      for (const lifetimeSeconds of [0, 3599, 30 * 86400 + 1, 3600.5]) {
        await expect(
          repository().invite(a.ctx, {
            email: identity().email!,
            role: 'viewer',
            lifetimeSeconds,
          }),
        ).rejects.toMatchObject({ code: 'invalid_input' });
      }
      for (const email of ['', 'not-an-email', 'a@invalid']) {
        await expect(
          repository().invite(a.ctx, { email, role: 'viewer' }),
        ).rejects.toMatchObject({ code: 'invalid_input' });
      }
      await expect(
        createTeamRepository(first.db).invite(a.ctx, {
          email: identity().email!,
          role: 'viewer',
        }),
      ).rejects.toMatchObject({ code: 'not_configured' });
      expect((await repository().list(a.ctx)).invitations).toEqual([]);
      expect((await repository().list(a.ctx)).history).toEqual([]);
      expect(
        await first.db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, a.org)),
      ).toEqual([]);
      for (const lifetimeSeconds of [3600, 30 * 86400]) {
        const started = Date.now();
        const id = await repository().invite(a.ctx, {
          email: identity().email!,
          role: 'viewer',
          lifetimeSeconds,
        });
        expect((await rowFor(id))!.expiresAt.getTime()).toBeGreaterThanOrEqual(
          started + lifetimeSeconds * 1000,
        );
        expect((await rowFor(id))!.expiresAt.getTime()).toBeLessThanOrEqual(
          Date.now() + lifetimeSeconds * 1000,
        );
      }
    });
  },
);

describe.skipIf(!url)('team role upgrade', () => {
  it('migrates legacy member to read-only viewer and preserves admin and membership state', async () => {
    const name = `team_upgrade_${randomUUID().replaceAll('-', '')}`;
    const folder = mkdtempSync(join(tmpdir(), 'team-upgrade-'));
    const admin = new Pool({ connectionString: url! });
    let pool: Pool | undefined;
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      const target = new URL(url!);
      target.pathname = `/${name}`;
      pool = new Pool({ connectionString: target.toString() });
      const journal = JSON.parse(
        readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'),
      );
      const roleMigration = journal.entries.find((entry: { tag: string }) =>
        entry.tag.endsWith('_team_roles'),
      );
      expect(roleMigration).toBeDefined();
      const entries = journal.entries.filter(
        (entry: { idx: number }) => entry.idx < roleMigration.idx,
      );
      mkdirSync(join(folder, 'meta'));
      writeFileSync(
        join(folder, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const entry of entries)
        cpSync(
          join(migrations, `${entry.tag}.sql`),
          join(folder, `${entry.tag}.sql`),
        );
      await migrateDrizzle(drizzle(pool), { migrationsFolder: folder });
      const org = (
        await pool.query(
          "insert into organization (slug,name,timezone,locale) values ('team','Team','UTC','de') returning id",
        )
      ).rows[0].id;
      for (const [index, role, status] of [
        [0, 'admin', 'active'],
        [1, 'member', 'active'],
        [2, 'member', 'disabled'],
      ] as const) {
        const user = (
          await pool.query(
            'insert into user_identity (issuer,subject) values ($1,$2) returning id',
            [issuer, `legacy-${index}`],
          )
        ).rows[0].id;
        await pool.query(
          'insert into organization_membership (organization_id,user_identity_id,role,status) values ($1,$2,$3,$4)',
          [org, user, role, status],
        );
      }
      const before = (
        await pool.query(
          'select * from organization_membership order by user_identity_id',
        )
      ).rows;
      await migrateDrizzle(drizzle(pool), { migrationsFolder: migrations });
      const after = (
        await pool.query(
          'select * from organization_membership order by user_identity_id',
        )
      ).rows;
      expect(after).toEqual(
        before.map((row) => ({
          ...row,
          role: row.role === 'member' ? 'viewer' : row.role,
        })),
      );
      const memberships = createMembershipRepository(drizzle(pool));
      const active = await memberships.resolvePermissions(
        { issuer, subject: 'legacy-1' },
        organizationId(org),
      );
      expect(active).toEqual(permissionsForRole('viewer'));
      for (const permission of [
        'role:admin',
        'entry:write',
        'payment:write',
        'organization:update',
        'timing:record',
      ])
        expect(active).not.toContain(permission);
      expect(
        await memberships.resolvePermissions(
          { issuer, subject: 'legacy-0' },
          organizationId(org),
        ),
      ).toEqual(permissionsForRole('admin'));
      expect(
        await memberships.resolvePermissions(
          { issuer, subject: 'legacy-2' },
          organizationId(org),
        ),
      ).toEqual(new Set());
      await expect(
        pool.query(
          "update organization_membership set role = 'member' where role = 'viewer'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await pool?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);
});
