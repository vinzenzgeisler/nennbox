import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participantMemoryConsentTerms } from '@nennbox/core';
import {
  createDatabase,
  createEntryAdminActionsRepository,
  createEntryRepository,
  createParticipantMemoryCleanup,
  createVehicleRepository,
  entryDocuments,
  events,
  migrate,
  organizations,
  participantMemoryAccess,
  participantMemoryAudit,
  participantMemoryConsents,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryRequests,
  participantMemoryVehicles,
} from './index.js';
import {
  adminContext,
  memoryFixture,
  publicContext,
} from './participant-memory-fixture.js';
import { participantMemoryEmailHash } from './participant-memory-token.js';
import { tokenKey } from './participant-memory-context.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const version = participantMemoryConsentTerms.version;
const slug = 'bergpreis-2030';

/** Erasure reaches the copies (review of #245, P1-2, probe R3) and the club can erase one person. */
describe.skipIf(!url)('participant memory: deletion chain', () => {
  let handle: Awaited<ReturnType<typeof createDatabase>>;
  const orgs: string[] = [];
  const email = 'fahrerin@example.test';
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
  const count = async (org: string) => {
    const counts: Record<string, number> = {};
    for (const [name, table] of Object.entries({
      profile: participantMemoryProfiles,
      vehicle: participantMemoryVehicles,
      passenger: participantMemoryPassengers,
      document: participantMemoryDocuments,
    }))
      counts[name] = (
        await handle.db
          .select()
          .from(table)
          .where(eq(table.organizationId, org))
      ).length;
    return counts;
  };
  const withEverything = async (name: string) => {
    const fx = f();
    const t = await fx.tenant(name);
    const reg = await fx.registration(t, { email, passenger: true });
    const doc = await fx.document(t, reg.entry.id, '2031-01-01');
    const s = await fx.enableAndSignIn(t, email);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect(await count(t.org.id)).toEqual({
      profile: 1,
      vehicle: 1,
      passenger: 1,
      document: 1,
    });
    return { fx, t, reg, doc, s };
  };

  it('R3: a document that is rejected after it was captured is no longer offered or handed out', async () => {
    const { t, reg, doc, s } = await withEverything('Abgelehnt');
    const offered = (await s.memory.view(s.ctx, s.identity!, slug))!.offer!;
    expect(offered.documents).toHaveLength(1);
    await handle.db
      .update(entryDocuments)
      .set({ status: 'rejected', rejectionReason: 'unleserlich' })
      .where(eq(entryDocuments.id, doc.id));
    expect(
      (await s.memory.view(s.ctx, s.identity!, slug))!.offer!.documents,
    ).toHaveLength(0);
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: slug,
        documents: [{ id: offered.documents[0]!.id, entryId: reg.entry.id }],
      }),
    ).toBeNull();
    // The next refresh removes the copy itself, not only the offer.
    await s.memory.revokeConsent(s.ctx, s.identity!);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect((await count(t.org.id)).document).toBe(0);
  });

  it('R3: deleting the source entry removes the copies in the same transaction', async () => {
    const { t, reg, s } = await withEverything('Quelle');
    expect(
      await createEntryRepository(handle.db).softDelete!(
        publicContext(t.org.id),
        reg.entry.id,
        'Löschbegehren Art. 17',
      ),
    ).not.toBeNull();
    expect(await count(t.org.id)).toEqual({
      profile: 0,
      vehicle: 0,
      passenger: 0,
      document: 0,
    });
    expect(await s.memory.view(s.ctx, s.identity!, slug)).toMatchObject({
      consent: { granted: true },
      offer: null,
    });
  });

  it('R3: the same holds when the club deletes the entry through the admin action', async () => {
    const { t, reg } = await withEverything('Admin');
    const result = await createEntryAdminActionsRepository(handle.db).perform(
      adminContext(t.org.id),
      reg.entry.id,
      { kind: 'delete', reason: 'Dublette', expectedVersion: 1 },
      'office',
    );
    expect(result).toEqual({ status: 'updated' });
    expect(await count(t.org.id)).toEqual({
      profile: 0,
      vehicle: 0,
      passenger: 0,
      document: 0,
    });
  });

  it('deleting one of two entries keeps what the other still supports', async () => {
    const { fx, t, s } = await withEverything('Zwei');
    const second = await fx.registration(t, {
      email,
      make: 'Lancia',
      vin: null,
      event: 'next',
    });
    await s.memory.revokeConsent(s.ctx, s.identity!);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect((await count(t.org.id)).vehicle).toBe(2);
    await createEntryRepository(handle.db).softDelete!(
      publicContext(t.org.id),
      second.entry.id,
      'Dublette',
    );
    expect(await count(t.org.id)).toEqual({
      profile: 1,
      vehicle: 1,
      passenger: 1,
      document: 1,
    });
  });

  it('deleting a vehicle takes its copy with it', async () => {
    const { t, reg } = await withEverything('Fahrzeug');
    await createVehicleRepository(handle.db).softDelete!(
      publicContext(t.org.id),
      reg.vehicle.id,
      'Irrtum',
    );
    expect((await count(t.org.id)).vehicle).toBe(0);
  });

  it('the club erases the memory of one person: audited, bound to its organization, others untouched', async () => {
    const { fx, t, s } = await withEverything('Loeschen');
    const other = await fx.registration(t, {
      email: 'zweite@example.test',
      firstName: 'Zweite',
      lastName: 'Person',
    });
    const s2 = await fx.signIn(t, 'zweite@example.test');
    await s2.memory.grantConsent(s2.ctx, s2.identity!, version);
    // The same address at another club keeps its own, separate memory.
    const foreign = await fx.tenant('Fremdverein');
    await fx.registration(foreign, { email });
    const sf = await fx.enableAndSignIn(foreign, email);
    await sf.memory.grantConsent(sf.ctx, sf.identity!, version);
    const admin = adminContext(t.org.id);
    // Not an administrator: refused, nothing erased.
    await expect(
      s.memory.eraseParticipant(adminContext(t.org.id, 'viewer'), email),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      s.memory.eraseParticipant(publicContext(t.org.id), email),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      s.memory.eraseParticipant(admin, 'not an address'),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await count(t.org.id)).profile).toBe(2);
    // An administrator of the other club cannot reach this club's person.
    await s.memory.eraseParticipant(adminContext(foreign.org.id), email);
    expect((await count(t.org.id)).profile).toBe(2);
    expect((await count(foreign.org.id)).profile).toBe(0);
    await sf.memory.grantConsent(sf.ctx, sf.identity!, version);
    expect((await count(foreign.org.id)).profile).toBe(1);

    expect(
      await s.memory.eraseParticipant(admin, ` ${email.toUpperCase()} `),
    ).toEqual({
      removed: 4,
    });
    // Gone for this person, untouched for the second person and for the other club.
    expect(await count(t.org.id)).toMatchObject({ profile: 1, vehicle: 1 });
    expect(await count(foreign.org.id)).toMatchObject({ profile: 1 });
    expect(await s.memory.session(s.ctx, s.session!)).toBeNull();
    expect(await s.memory.view(s.ctx, s.identity!, slug)).toMatchObject({
      consent: { granted: false },
      offer: null,
    });
    const [audit] = await handle.db
      .select()
      .from(participantMemoryAudit)
      .where(eq(participantMemoryAudit.organizationId, t.org.id));
    expect(audit).toMatchObject({
      action: 'erased',
      removedRows: 4,
      emailHash: participantMemoryEmailHash(tokenKey, t.org.id, email),
      actorIssuer: 'https://id.example.test',
    });
    expect(JSON.stringify(audit)).not.toContain(email);
    // The second person was not touched at all, and the entry itself remains.
    expect(
      (await s2.memory.view(s2.ctx, s2.identity!, slug))!.offer,
    ).not.toBeNull();
    void other;
    // Erasing works with the feature switched off, and without anything stored.
    await s.memory.configure(admin, { enabled: false });
    expect(await s.memory.eraseParticipant(admin, email)).toEqual({
      removed: 0,
    });
  });

  it('R5: after withdrawal or deletion the address is nowhere in the consent log, only its keyed hash', async () => {
    const { fx, t, s } = await withEverything('Protokoll');
    const hash = participantMemoryEmailHash(tokenKey, t.org.id, email);
    const log = () =>
      handle.db
        .select()
        .from(participantMemoryConsents)
        .where(eq(participantMemoryConsents.organizationId, t.org.id));
    // While active the address is needed to find the consent; the hash is already there.
    expect(await log()).toMatchObject([{ email, emailHash: hash }]);
    await s.memory.revokeConsent(s.ctx, s.identity!);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    await s.memory.requestAccess(s.ctx, email, 'delete', 'de');
    await fx.processRequests();
    await handle.db
      .update(participantMemoryAccess)
      .set({ createdAt: sql`now() - interval '5 minutes'` })
      .where(eq(participantMemoryAccess.organizationId, t.org.id));
    const token = (await fx.mailedToken(t.org.id, 'delete', email))!;
    expect(await s.memory.redeemDelete(s.ctx, token)).toBe(true);
    const closed = await log();
    expect(closed.map((row) => row.revokedReason).sort()).toEqual([
      'deleted',
      'withdrawn',
    ]);
    for (const row of closed) {
      expect(row.email).toBeNull();
      expect(row.emailHash).toBe(hash);
    }
    expect(JSON.stringify(closed)).not.toContain(email);
    // A different club's hash for the same address differs: no cross-club linking through the log.
    expect(participantMemoryEmailHash(tokenKey, orgs[0]!, email)).not.toBe(
      hash,
    );
  });

  it('the cleanup drops stuck link requests, ages out the erasure audit and ends expired consent without the address', async () => {
    const { t, s } = await withEverything('Aufraeumen');
    await s.memory.eraseParticipant(adminContext(t.org.id), 'weg@example.test');
    await handle.db.insert(participantMemoryRequests).values([
      {
        organizationId: t.org.id,
        email: 'alt@example.test',
        purpose: 'access',
        locale: 'de',
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
      {
        organizationId: t.org.id,
        email: 'neu@example.test',
        purpose: 'access',
        locale: 'de',
      },
    ]);
    await handle.db
      .update(participantMemoryAudit)
      .set({ occurredAt: sql`now() - interval '1100 days'` })
      .where(eq(participantMemoryAudit.organizationId, t.org.id));
    await handle.db
      .update(participantMemoryConsents)
      .set({ grantedAt: sql`now() - interval '400 days'` })
      .where(eq(participantMemoryConsents.organizationId, t.org.id));
    await handle.db.delete(participantMemoryProfiles);
    await handle.db.delete(participantMemoryVehicles);
    await handle.db.delete(participantMemoryPassengers);
    await handle.db.delete(participantMemoryDocuments);
    const cleanup = createParticipantMemoryCleanup(handle.db, {
      defaultDays: 365,
      minimumDays: 30,
      maximumDays: 1095,
    });
    expect((await cleanup.cleanupOrganization(t.org.id)).consentsClosed).toBe(
      1,
    );
    expect(
      (
        await handle.db
          .select()
          .from(participantMemoryRequests)
          .where(eq(participantMemoryRequests.organizationId, t.org.id))
      ).map((row) => row.email),
    ).toEqual(['neu@example.test']);
    expect(
      await handle.db
        .select()
        .from(participantMemoryAudit)
        .where(eq(participantMemoryAudit.organizationId, t.org.id)),
    ).toHaveLength(0);
    const [closed] = await handle.db
      .select()
      .from(participantMemoryConsents)
      .where(eq(participantMemoryConsents.organizationId, t.org.id));
    expect(closed).toMatchObject({ revokedReason: 'expired', email: null });
    expect(closed!.emailHash).toBeTruthy();
  });
});
