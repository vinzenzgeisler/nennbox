import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from 'graphile-worker';
import {
  organizationId,
  staticCanonicalOrigin,
  type ExternalIdentity,
} from '@nennbox/core';
import {
  createDatabase,
  migrate,
  createMembershipRepository,
  createTeamRepository,
  organizations,
  organizationMemberships,
  userIdentities,
  teamInvitations,
  emailOutbox,
  deriveTeamInvitationToken,
} from '@nennbox/adapter-postgres';
import { createApp } from './app.js';
import { testDeps } from './testing.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const key = 'a'.repeat(64);
const issuer = 'https://review-id.test';
describe.skipIf(!url)('team review fixes through HTTP and PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createDatabase>>;
  const orgs: string[] = [];
  beforeAll(async () => {
    await migrate(url!);
    await runMigrations({ connectionString: url! });
    database = await createDatabase(url!);
  });
  afterAll(async () => {
    if (!database) return;
    for (const org of orgs)
      await database.db.delete(organizations).where(eq(organizations.id, org));
    await database.db
      .delete(userIdentities)
      .where(eq(userIdentities.issuer, issuer));
    await database.pool.end();
  });
  async function fixture() {
    const { db } = database;
    const [org] = await db
      .insert(organizations)
      .values({
        slug: randomUUID(),
        name: 'Review',
        timezone: 'UTC',
        locale: 'de',
      })
      .returning();
    orgs.push(org!.id);
    const admin: ExternalIdentity = {
      issuer,
      subject: randomUUID(),
      email: 'admin@example.test',
      emailVerified: true,
    };
    let identity: ExternalIdentity | null = admin;
    const memberships = createMembershipRepository(db);
    await memberships.resolvePermissions(admin, organizationId(org!.id), {
      issuer,
      subject: admin.subject,
    });
    const team = createTeamRepository(db, {
      tokenKey: key,
      canonicalOrigin: staticCanonicalOrigin('https://review.example.test'),
    });
    const app = createApp(
      testDeps({
        config: { deploymentMode: 'community', organizationId: org!.id },
        organizations: { getById: async () => null, update: async () => null },
        events: {
          listByOrganization: async () => [],
          getById: async () => null,
        },
        authenticator: { authenticate: async () => identity },
        memberships,
        team,
      }),
    );
    const post = (path: string, body?: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function invite(email: string) {
      identity = admin;
      const response = await post('/admin/team/invitations', {
        email,
        role: 'office',
      });
      expect(response.status, await response.clone().text()).toBe(201);
      const { id } = await response.json();
      const [row] = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, id));
      const mails = (
        await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, org!.id))
      ).filter((m) => m.idempotencyKey.startsWith(`team:${id}:`));
      return {
        row: row!,
        token: deriveTeamInvitationToken(
          key,
          mails[0]!.variables.invitationNonce!,
        ),
      };
    }
    return {
      org: org!.id,
      admin,
      app,
      post,
      invite,
      memberships,
      setIdentity: (value: ExternalIdentity | null) => {
        identity = value;
      },
    };
  }
  it.each([
    [
      '  Mixed.Case+office@BÜRO.test  ',
      'mixed.case+office@xn--bro-hoa.test',
      ' MIXED.CASE+OFFICE@büro.test ',
    ],
    ['Team@xn--bro-hoa.test', 'team@xn--bro-hoa.test', 'team@BÜRO.test'],
  ])(
    'normalizes invitation and verified claim %s',
    async (input, expected, claim) => {
      const f = await fixture();
      const invite = await f.invite(input);
      expect(invite.row.email).toBe(expected);
      f.setIdentity({
        issuer,
        subject: randomUUID(),
        email: claim,
        emailVerified: true,
      });
      expect(
        (await f.post('/auth/invitations/redeem', { token: invite.token }))
          .status,
      ).toBe(204);
    },
  );
  it('rejects Unicode local parts at both HTTP boundaries with a readable error', async () => {
    const f = await fixture();
    const response = await f.post('/admin/team/invitations', {
      email: 'büro@example.test',
      role: 'office',
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('ASCII local part');
    const invite = await f.invite('buro@example.test');
    f.setIdentity({
      issuer,
      subject: randomUUID(),
      email: 'büro@example.test',
      emailVerified: true,
    });
    const redemption = await f.post('/auth/invitations/redeem', {
      token: invite.token,
    });
    expect(redemption.status).toBe(400);
    expect(await redemption.text()).toContain('ASCII local part');
    const [row] = await database.db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, invite.row.id));
    expect(row!.redeemedAt).toBeNull();
  });
  it.each([
    ['team.office@example.test', 'teamoffice@example.test'],
    ['team.office+desk@example.test', 'team.office@example.test'],
  ])('does not merge %s with %s', async (email, claim) => {
    const f = await fixture();
    const invite = await f.invite(email);
    f.setIdentity({
      issuer,
      subject: randomUUID(),
      email: claim,
      emailVerified: true,
    });
    expect(
      (await f.post('/auth/invitations/redeem', { token: invite.token }))
        .status,
    ).toBe(403);
  });
  it('records only login completion, scoped to an active identity membership, without changing updatedAt', async () => {
    const f = await fixture();
    const other = await fixture();
    const { db } = database;
    const [user] = await db
      .select()
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.issuer, issuer),
          eq(userIdentities.subject, f.admin.subject),
        ),
      );
    await db.insert(organizationMemberships).values({
      organizationId: other.org,
      userIdentityId: user!.id,
      role: 'viewer',
    });
    const member = async (org: string) =>
      (
        await db
          .select()
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, org),
              eq(organizationMemberships.userIdentityId, user!.id),
            ),
          )
      )[0]!;
    const initial = await member(f.org);
    expect(initial.lastSignedInAt).toBeNull();
    await f.app.request('/admin/session');
    await f.app.request('/admin/team');
    expect((await member(f.org)).lastSignedInAt).toBeNull();
    expect((await f.post('/auth/session')).status).toBe(204);
    const signedIn = await member(f.org);
    expect(signedIn.lastSignedInAt).toBeInstanceOf(Date);
    expect(signedIn.updatedAt).toEqual(initial.updatedAt);
    expect((await member(other.org)).lastSignedInAt).toBeNull();
    await f.app.request('/admin/session');
    await f.app.request('/admin/team');
    expect((await member(f.org)).lastSignedInAt).toEqual(
      signedIn.lastSignedInAt,
    );
    const snapshot = await (await f.app.request('/admin/team')).json();
    expect(
      snapshot.members.find((m: { id: string }) => m.id === user!.id)
        .lastSignedInAt,
    ).toBe(signedIn.lastSignedInAt!.toISOString());
    f.setIdentity(null);
    expect((await f.post('/auth/session')).status).toBe(401);
    f.setIdentity({ ...f.admin, issuer: 'https://wrong-issuer.test' });
    expect((await f.post('/auth/session')).status).toBe(403);
    f.setIdentity({ ...f.admin, subject: randomUUID() });
    expect((await f.post('/auth/session')).status).toBe(403);
    f.setIdentity(f.admin);
    await db
      .update(organizationMemberships)
      .set({ status: 'disabled' })
      .where(
        and(
          eq(organizationMemberships.organizationId, f.org),
          eq(organizationMemberships.userIdentityId, user!.id),
        ),
      );
    expect((await f.post('/auth/session')).status).toBe(403);
    expect((await member(f.org)).lastSignedInAt).toEqual(
      signedIn.lastSignedInAt,
    );
    await db
      .update(organizationMemberships)
      .set({
        status: 'active',
        lastSignedInAt: new Date('2000-01-01T00:00:00Z'),
      })
      .where(
        and(
          eq(organizationMemberships.organizationId, f.org),
          eq(organizationMemberships.userIdentityId, user!.id),
        ),
      );
    expect((await f.post('/auth/session')).status).toBe(204);
    expect((await member(f.org)).lastSignedInAt!.getTime()).toBeGreaterThan(
      Date.parse('2000-01-01T00:00:00Z'),
    );
    expect((await member(f.org)).updatedAt).toEqual(initial.updatedAt);
  });
});
