import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participantMemoryConsentTerms } from '@nennbox/core';
import {
  createDatabase,
  deriveParticipantMemoryToken,
  emailOutbox,
  entries,
  events,
  migrate,
  organizations,
  participantMemoryAccess,
  participantMemoryConsents,
  participantMemoryProfiles,
  participantMemorySettings,
} from './index.js';
import {
  adminContext,
  memoryFixture,
  publicContext,
  tokenKey,
} from './participant-memory-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const version = participantMemoryConsentTerms.version;
const email = 'rueckkehrer@example.test';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe.skipIf(!url)(
  'participant memory tokens, deletion and settings',
  () => {
    let handle: Awaited<ReturnType<typeof createDatabase>>;
    const orgs: string[] = [];
    beforeAll(async () => {
      await migrate(url!);
      handle = await createDatabase(url!);
    }, 60_000);
    afterAll(async () => {
      if (!handle) return;
      try {
        for (const id of orgs) {
          await handle.db.delete(events).where(eq(events.organizationId, id));
          await handle.db.delete(organizations).where(eq(organizations.id, id));
        }
      } finally {
        await handle.pool.end();
      }
    });
    const f = () => memoryFixture(handle.db, orgs);
    const expire = (org: string, purpose: string) =>
      handle.db
        .update(participantMemoryAccess)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(
          and(
            eq(participantMemoryAccess.organizationId, org),
            eq(participantMemoryAccess.purpose, purpose),
          ),
        );

    it('magic link: single use, expiring, bound to the organization that issued it, hash only at rest', async () => {
      const fx = f();
      const a = await fx.tenant('LinkA');
      const b = await fx.tenant('LinkB');
      await fx.registration(a, { email });
      await fx.registration(b, { email });
      const memory = fx.repository();
      await memory.configure(adminContext(a.org.id), { enabled: true });
      await memory.configure(adminContext(b.org.id), { enabled: true });
      await memory.requestAccess(
        publicContext(a.org.id),
        email,
        'access',
        'de',
      );
      const token = (await fx.mailedToken(a.org.id, 'access', email))!;
      // The mail row carries a public nonce only, never the bearer or its hash.
      const [mail] = await handle.db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, a.org.id));
      expect(JSON.stringify(mail!.variables)).not.toContain(token);
      expect(JSON.stringify(mail!.variables)).not.toContain(sha(token));
      expect(Object.keys(mail!.variables)).toEqual(['accessNonce']);
      const [stored] = await handle.db
        .select()
        .from(participantMemoryAccess)
        .where(eq(participantMemoryAccess.organizationId, a.org.id));
      expect(stored!.tokenHash).toBe(sha(token));
      expect(JSON.stringify(stored)).not.toContain(token);
      // Another club cannot redeem it, and the failed attempt does not burn it.
      expect(
        await memory.redeemAccess(publicContext(b.org.id), token),
      ).toBeNull();
      // A delete bearer never opens an access link (purpose is part of the MAC).
      const nonce = mail!.variables.accessNonce!;
      expect(deriveParticipantMemoryToken(tokenKey, 'delete', nonce)).not.toBe(
        token,
      );
      expect(await memory.redeemDelete(publicContext(a.org.id), token)).toBe(
        false,
      );
      const session = await memory.redeemAccess(publicContext(a.org.id), token);
      expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // Second redemption fails, also under concurrency.
      expect(
        await memory.redeemAccess(publicContext(a.org.id), token),
      ).toBeNull();
      await memory.requestAccess(
        publicContext(a.org.id),
        'x@example.test',
        'access',
        'de',
      );
      // The session belongs to A only.
      expect(await memory.session(publicContext(a.org.id), session!)).toEqual({
        organizationId: a.org.id,
        email,
      });
      expect(
        await memory.session(publicContext(b.org.id), session!),
      ).toBeNull();
      // Sessions expire and can be ended.
      await memory.endSession(publicContext(a.org.id), session!);
      expect(
        await memory.session(publicContext(a.org.id), session!),
      ).toBeNull();
    });

    it('magic link: concurrent redemption yields exactly one session', async () => {
      const fx = f();
      const t = await fx.tenant('Race');
      await fx.registration(t, { email });
      const memory = fx.repository();
      await memory.configure(adminContext(t.org.id), { enabled: true });
      await memory.requestAccess(
        publicContext(t.org.id),
        email,
        'access',
        'de',
      );
      const token = (await fx.mailedToken(t.org.id, 'access', email))!;
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          memory.redeemAccess(publicContext(t.org.id), token),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('magic link: expired links and sessions are refused; resending is throttled and supersedes the old link', async () => {
      const fx = f();
      const t = await fx.tenant('Ablauf');
      await fx.registration(t, { email });
      const memory = fx.repository();
      await memory.configure(adminContext(t.org.id), { enabled: true });
      const ctx = publicContext(t.org.id);
      await memory.requestAccess(ctx, email, 'access', 'de');
      await memory.requestAccess(ctx, email, 'access', 'de');
      expect(
        await handle.db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, t.org.id)),
      ).toHaveLength(1);
      const first = (await fx.mailedToken(t.org.id, 'access', email))!;
      await expire(t.org.id, 'access');
      expect(await memory.redeemAccess(ctx, first)).toBeNull();
      // After the throttle window a fresh link replaces an unused one.
      await handle.db
        .update(participantMemoryAccess)
        .set({
          createdAt: sql`now() - interval '2 minutes'`,
          expiresAt: sql`now() + interval '10 minutes'`,
        })
        .where(eq(participantMemoryAccess.organizationId, t.org.id));
      await memory.requestAccess(ctx, email, 'access', 'de');
      const second = (await fx.mailedToken(t.org.id, 'access', email))!;
      expect(second).not.toBe(first);
      expect(await memory.redeemAccess(ctx, first)).toBeNull();
      const session = (await memory.redeemAccess(ctx, second))!;
      await expire(t.org.id, 'session');
      expect(await memory.session(ctx, session)).toBeNull();
      expect(await memory.redeemAccess(ctx, 'not-a-token')).toBeNull();
    });

    it('delete link: removes the memory of this club only, once, before expiry, not for a foreign organization', async () => {
      const fx = f();
      const a = await fx.tenant('DelA');
      const b = await fx.tenant('DelB');
      const regA = await fx.registration(a, { email, passenger: true });
      await fx.registration(b, { email });
      const sa = await fx.enableAndSignIn(a, email);
      const sb = await fx.enableAndSignIn(b, email);
      await sa.memory.grantConsent(sa.ctx, sa.identity!, version);
      await sb.memory.grantConsent(sb.ctx, sb.identity!, version);
      await sa.memory.requestAccess(sa.ctx, email, 'delete', 'de');
      const token = (await fx.mailedToken(a.org.id, 'delete', email))!;
      // Not valid at club B; an expired copy would not work either.
      expect(await sa.memory.redeemDelete(sb.ctx, token)).toBe(false);
      expect(
        (await sb.memory.view(sb.ctx, sb.identity!, 'bergpreis-2030'))!.offer,
      ).not.toBeNull();
      await expire(a.org.id, 'delete');
      expect(await sa.memory.redeemDelete(sa.ctx, token)).toBe(false);
      expect(
        (await sa.memory.view(sa.ctx, sa.identity!, 'bergpreis-2030'))!.offer,
      ).not.toBeNull();
      await handle.db
        .update(participantMemoryAccess)
        .set({
          expiresAt: sql`now() + interval '1 hour'`,
          createdAt: sql`now() - interval '5 minutes'`,
        })
        .where(
          and(
            eq(participantMemoryAccess.organizationId, a.org.id),
            eq(participantMemoryAccess.purpose, 'delete'),
          ),
        );
      expect(await sa.memory.redeemDelete(sa.ctx, token)).toBe(true);
      // Used once.
      expect(await sa.memory.redeemDelete(sa.ctx, token)).toBe(false);
      // A is empty and closed (also for the open session), B is untouched, the entry remains.
      expect(await sa.memory.session(sa.ctx, sa.session!)).toBeNull();
      expect(
        await handle.db
          .select()
          .from(participantMemoryProfiles)
          .where(eq(participantMemoryProfiles.organizationId, a.org.id)),
      ).toHaveLength(0);
      expect(
        await handle.db
          .select()
          .from(participantMemoryProfiles)
          .where(eq(participantMemoryProfiles.organizationId, b.org.id)),
      ).toHaveLength(1);
      const [log] = await handle.db
        .select()
        .from(participantMemoryConsents)
        .where(eq(participantMemoryConsents.organizationId, a.org.id));
      expect(log?.revokedReason).toBe('deleted');
      expect(
        await handle.db
          .select()
          .from(entries)
          .where(eq(entries.id, regA.entry.id)),
      ).toHaveLength(1);
      // Without consent or stored data no delete link is mailed.
      await sa.memory.requestAccess(sa.ctx, email, 'delete', 'de');
      expect(
        (
          await handle.db
            .select()
            .from(emailOutbox)
            .where(
              and(
                eq(emailOutbox.organizationId, a.org.id),
                eq(emailOutbox.templateKey, 'participant-memory-delete'),
              ),
            )
        ).length,
      ).toBe(1);
    });

    it('organization settings: admin only, bounds enforced, defaults documented, switching off purges and demands fresh consent', async () => {
      const fx = f();
      const t = await fx.tenant('Settings');
      await fx.registration(t, { email });
      const memory = fx.repository();
      const admin = adminContext(t.org.id);
      expect(await memory.settings(admin)).toMatchObject({
        enabled: false,
        retentionDays: null,
        effectiveRetentionDays: 365,
        bounds: { defaultDays: 365, minimumDays: 30, maximumDays: 1095 },
        storedParticipants: 0,
      });
      await expect(
        memory.configure(adminContext(t.org.id, 'viewer'), { enabled: true }),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        memory.settings(adminContext(t.org.id, 'viewer')),
      ).rejects.toMatchObject({ code: 'forbidden' });
      for (const retentionDays of [29, 1096, 1.5, 0, -5])
        await expect(
          memory.configure(admin, { enabled: true, retentionDays }),
        ).rejects.toMatchObject({ code: 'invalid_input' });
      expect(
        await handle.db
          .select()
          .from(participantMemorySettings)
          .where(eq(participantMemorySettings.organizationId, t.org.id)),
      ).toHaveLength(0);
      expect(
        await memory.configure(admin, { enabled: true, retentionDays: 90 }),
      ).toMatchObject({ enabled: true, effectiveRetentionDays: 90, purged: 0 });
      const s = await fx.signIn(t, email);
      await memory.grantConsent(s.ctx, s.identity!, version);
      expect((await memory.settings(admin)).storedParticipants).toBe(1);
      expect(
        await memory.configure(admin, { retentionDays: null }),
      ).toMatchObject({ retentionDays: null, effectiveRetentionDays: 365 });
      const off = await memory.configure(admin, { enabled: false });
      expect(off.purged).toBe(2); // profile and vehicle
      expect(off.storedParticipants).toBe(0);
      expect(
        await memory.view(s.ctx, s.identity!, 'bergpreis-2030'),
      ).toBeNull();
      expect(await memory.session(s.ctx, s.session!)).toBeNull();
      await memory.configure(admin, { enabled: true });
      const again = await fx.signIn(t, email);
      expect(
        await memory.view(again.ctx, again.identity!, 'bergpreis-2030'),
      ).toMatchObject({ consent: { granted: false }, offer: null });
      // Settings of one club never leak into another.
      const other = await fx.tenant('SettingsOther');
      expect((await memory.settings(adminContext(other.org.id))).enabled).toBe(
        false,
      );
    });
  },
);
