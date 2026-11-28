import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participantMemoryConsentTerms } from '@nennbox/core';
import {
  createDatabase,
  createParticipantMemoryCleanup,
  entries,
  entryDocuments,
  events,
  emailOutbox,
  migrate,
  organizations,
  participantMemoryAccess,
  participantMemoryConsents,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryVehicles,
  refreshParticipantMemoryForGroup,
} from './index.js';
import {
  adminContext,
  memoryFixture,
  publicContext,
  tokenKey,
} from './participant-memory-fixture.js';
import { participantMemoryEmailHash } from './participant-memory-token.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const version = participantMemoryConsentTerms.version;

describe.skipIf(!url)('participant memory PostgreSQL integration', () => {
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
        // Events do not cascade from organizations; entries, groups and documents follow the events.
        await handle.db.delete(events).where(eq(events.organizationId, id));
        await handle.db.delete(organizations).where(eq(organizations.id, id));
      }
    } finally {
      await handle.pool.end();
    }
  });
  const f = () => memoryFixture(handle.db, orgs);
  const rows = (
    table:
      | typeof participantMemoryProfiles
      | typeof participantMemoryVehicles
      | typeof participantMemoryPassengers
      | typeof participantMemoryDocuments,
    org: string,
  ): Promise<Record<string, unknown>[]> =>
    handle.db.select().from(table).where(eq(table.organizationId, org));
  const view = (
    s: {
      memory: ReturnType<ReturnType<typeof f>['repository']>;
      ctx: ReturnType<typeof publicContext>;
      identity: { organizationId: string; email: string } | null;
    },
    slug = 'bergpreis-2030',
  ) => s.memory.view(s.ctx, s.identity!, slug);

  it('offers the previous entry only after consent, with a preview per field and masked identifiers', async () => {
    const fx = f();
    const t = await fx.tenant('Ein');
    await fx.registration(t, { email, passenger: true });
    await fx.registration(t, { email, make: 'Alfa', vin: null });
    const s = await fx.enableAndSignIn(t, email);
    expect(s.identity).toEqual({ organizationId: t.org.id, email });
    // No consent yet: nothing is offered and nothing has been stored.
    expect(await view(s)).toMatchObject({
      consent: { granted: false },
      offer: null,
    });
    expect(await rows(participantMemoryProfiles, t.org.id)).toHaveLength(0);
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: 'bergpreis-2030',
        driver: ['firstName'],
      }),
    ).toBeNull();
    expect(await s.memory.grantConsent(s.ctx, s.identity!, 'outdated')).toBe(
      false,
    );
    expect(await s.memory.grantConsent(s.ctx, s.identity!, version)).toBe(true);
    const shown = await view(s);
    expect(shown?.consent).toMatchObject({
      granted: true,
      wordingVersion: version,
    });
    const offer = shown!.offer!;
    expect(offer.source.eventName).toBe('Ein bergpreis-2026');
    expect(offer.driver).toEqual(
      expect.arrayContaining([
        { key: 'firstName', preview: 'Alex' },
        { key: 'licenseNumber', preview: '••••8877' },
      ]),
    );
    expect(offer.vehicles).toHaveLength(2);
    expect(
      offer.vehicles.flatMap((v) => v.fields).find((x) => x.key === 'vin')
        ?.preview,
    ).toBe('••••3456');
    expect(offer.passenger).toEqual(
      expect.arrayContaining([{ key: 'firstName', preview: 'Pat' }]),
    );
    // Taking is per field: only what was asked for is handed out, and in full.
    const taken = await s.memory.take(s.ctx, s.identity!, {
      eventSlug: 'bergpreis-2030',
      driver: ['firstName', 'licenseNumber'],
      vehicles: [{ id: offer.vehicles[0]!.id, fields: ['make', 'vin'] }],
      passenger: ['email'],
    });
    expect(taken?.driver).toEqual({
      firstName: 'Alex',
      licenseNumber: 'DMSB-998877',
    });
    expect(Object.keys(taken!.vehicles[0]!.values)).toEqual(['make', 'vin']);
    expect(taken?.passenger).toEqual({ email: 'pat@example.test' });
  });

  it('does not recognize an e-mail that was never verified', async () => {
    const fx = f();
    const t = await fx.tenant('Unbestaetigt');
    await fx.registration(t, { email, verified: false });
    const s = await fx.enableAndSignIn(t, email);
    expect(s.token).toBeNull();
    expect(
      await handle.db
        .select()
        .from(participantMemoryAccess)
        .where(eq(participantMemoryAccess.organizationId, t.org.id)),
    ).toHaveLength(0);
  });

  it('keeps organizations apart: the same e-mail at club A and B never crosses', async () => {
    const fx = f();
    const a = await fx.tenant('A');
    const b = await fx.tenant('B');
    await fx.registration(a, { email, firstName: 'Anna', lastName: 'VereinA' });
    await fx.registration(b, {
      email,
      firstName: 'Berta',
      lastName: 'VereinB',
      make: 'Fiat',
    });
    const sa = await fx.enableAndSignIn(a, email);
    expect(await sa.memory.grantConsent(sa.ctx, sa.identity!, version)).toBe(
      true,
    );
    const offerA = (await view(sa))!.offer!;
    expect(offerA.driver).toContainEqual({ key: 'firstName', preview: 'Anna' });
    expect(JSON.stringify(offerA)).not.toMatch(/Berta|VereinB|Fiat/);
    // Club B has the feature switched on as well, but the person never consented there.
    const sb = await fx.enableAndSignIn(b, email);
    expect(await view(sb)).toMatchObject({
      consent: { granted: false },
      offer: null,
    });
    expect(JSON.stringify(await view(sb))).not.toMatch(/Anna|VereinA/);
    expect(
      await sb.memory.take(sb.ctx, sb.identity!, {
        eventSlug: 'bergpreis-2030',
        driver: ['firstName'],
      }),
    ).toBeNull();
    // A's identity replayed against B's tenant reads nothing, and a vehicle id of A is unknown in B.
    const forged = { organizationId: b.org.id, email };
    const vehicleOfA = offerA.vehicles[0]!.id;
    expect(await sb.memory.grantConsent(sb.ctx, forged, version)).toBe(true);
    const offerB = (await view(sb))!.offer!;
    expect(JSON.stringify(offerB)).not.toMatch(/Anna|VereinA/);
    expect(
      await sb.memory.take(sb.ctx, forged, {
        eventSlug: 'bergpreis-2030',
        vehicles: [{ id: vehicleOfA, fields: ['make'] }],
      }),
    ).toBeNull();
    // Withdrawing at B leaves A untouched; deleting at A leaves B untouched.
    await sb.memory.revokeConsent(sb.ctx, forged);
    expect(await rows(participantMemoryProfiles, a.org.id)).toHaveLength(1);
    expect(await rows(participantMemoryProfiles, b.org.id)).toHaveLength(0);
    // An e-mail known only at A gets no link at B, and the answer is the same silent no-op.
    const c = await fx.tenant('C');
    const sc = await fx.enableAndSignIn(c, email);
    expect(sc.token).toBeNull();
    expect(
      await handle.db
        .select()
        .from(emailOutbox)
        .where(
          and(
            eq(emailOutbox.organizationId, c.org.id),
            eq(emailOutbox.recipient, email),
          ),
        ),
    ).toHaveLength(0);
  });

  it('is off by default and everything is closed while the organization has not switched it on', async () => {
    const fx = f();
    const t = await fx.tenant('Aus');
    await fx.registration(t, { email });
    const memory = fx.repository();
    await memory.requestAccess(publicContext(t.org.id), email, 'access', 'de');
    await fx.processRequests();
    expect(await fx.mailedToken(t.org.id, 'access', email)).toBeNull();
    expect(
      await memory.view(
        publicContext(t.org.id),
        { organizationId: t.org.id, email },
        'bergpreis-2030',
      ),
    ).toBeNull();
    expect(
      await memory.grantConsent(
        publicContext(t.org.id),
        { organizationId: t.org.id, email },
        version,
      ),
    ).toBe(false);
  });

  it('withdrawal ends the offer and deletes the stored data, existing entries stay', async () => {
    const fx = f();
    const t = await fx.tenant('Widerruf');
    const reg = await fx.registration(t, { email, passenger: true });
    const s = await fx.enableAndSignIn(t, email);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect((await view(s))!.offer).not.toBeNull();
    await s.memory.revokeConsent(s.ctx, s.identity!);
    expect(await view(s)).toMatchObject({
      consent: { granted: false },
      offer: null,
    });
    for (const table of [
      participantMemoryProfiles,
      participantMemoryVehicles,
      participantMemoryPassengers,
      participantMemoryDocuments,
    ] as const)
      expect(await rows(table, t.org.id)).toHaveLength(0);
    const [log] = await handle.db
      .select()
      .from(participantMemoryConsents)
      .where(eq(participantMemoryConsents.organizationId, t.org.id));
    // The address is gone from the log; only the organization-bound hash remains as proof.
    expect(log).toMatchObject({
      email: null,
      emailHash: participantMemoryEmailHash(tokenKey, t.org.id, email),
      wordingVersion: version,
      revokedReason: 'withdrawn',
    });
    expect(log!.grantedAt).toBeInstanceOf(Date);
    expect(log!.revokedAt).toBeInstanceOf(Date);
    const [kept] = await handle.db
      .select()
      .from(entries)
      .where(eq(entries.id, reg.entry.id));
    expect(kept?.deletedAt).toBeNull();
    // Consenting again is a new, separately logged grant.
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect(
      await handle.db
        .select()
        .from(participantMemoryConsents)
        .where(eq(participantMemoryConsents.organizationId, t.org.id)),
    ).toHaveLength(2);
  });

  it('never offers or hands out stored data without an active consent, even if the data is still there', async () => {
    const fx = f();
    const t = await fx.tenant('Ohne Einwilligung');
    await fx.registration(t, { email, passenger: true });
    const s = await fx.enableAndSignIn(t, email);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect((await view(s))!.offer).not.toBeNull();
    // Simulate an inconsistent state: the consent is closed but the data was not purged.
    await handle.db
      .update(participantMemoryConsents)
      .set({ revokedAt: new Date(), revokedReason: 'withdrawn', email: null })
      .where(eq(participantMemoryConsents.organizationId, t.org.id));
    expect(await rows(participantMemoryProfiles, t.org.id)).toHaveLength(1);
    expect(await view(s)).toMatchObject({
      consent: { granted: false },
      offer: null,
    });
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: 'bergpreis-2030',
        driver: ['firstName'],
      }),
    ).toBeNull();
  });

  it('only offers documents that are still valid on the day of the new event', async () => {
    const fx = f();
    const t = await fx.tenant('Unterlagen', '2030-06-02');
    const reg = await fx.registration(t, { email });
    await fx.document(t, reg.entry.id, '2030-06-02');
    await fx.document(t, reg.entry.id, '2030-06-01');
    await fx.document(t, reg.entry.id, null);
    await fx.document(t, reg.entry.id, '2031-01-01', 'uploaded');
    const s = await fx.enableAndSignIn(t, email);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    const stored = await rows(participantMemoryDocuments, t.org.id);
    expect(stored.map((d) => String(d.validUntil)).sort()).toEqual([
      '2030-06-01',
      '2030-06-02',
    ]);
    const offered = (await view(s))!.offer!.documents;
    expect(offered.map((d) => d.validUntil)).toEqual(['2030-06-02']);
    // The same memory at an earlier event offers the longer-lived copy as well.
    const nextRegistration = await fx.registration(t, { email, event: 'next' });
    const taken = await s.memory.take(s.ctx, s.identity!, {
      eventSlug: 'bergpreis-2030',
      documents: [{ id: offered[0]!.id, entryId: nextRegistration.entry.id }],
    });
    expect(taken?.documents).toHaveLength(1);
    const [copy] = await handle.db
      .select()
      .from(entryDocuments)
      .where(eq(entryDocuments.id, taken!.documents[0]!.entryDocumentId));
    expect(copy).toMatchObject({
      entryId: nextRegistration.entry.id,
      status: 'uploaded',
      uploadedBy: 'participant-memory',
    });
    expect(String(copy!.validUntil)).toBe('2030-06-02');
    // An expired document cannot be forced through take, and a foreign entry is refused.
    const expired = stored.find((d) => String(d.validUntil) === '2030-06-01')!;
    const expiredId = expired.id as string;
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: 'bergpreis-2030',
        documents: [{ id: expiredId, entryId: nextRegistration.entry.id }],
      }),
    ).toBeNull();
    const stranger = await fx.registration(t, {
      email: 'fremd@example.test',
      event: 'next',
    });
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: 'bergpreis-2030',
        documents: [{ id: offered[0]!.id, entryId: stranger.entry.id }],
      }),
    ).toBeNull();
  });

  it('retention: expired data is not offered even before cleanup, and cleanup removes it per tenant', async () => {
    const fx = f();
    const a = await fx.tenant('RetA');
    const b = await fx.tenant('RetB');
    await fx.registration(a, { email, passenger: true });
    await fx.registration(b, { email });
    const sa = await fx.enableAndSignIn(a, email);
    const sb = await fx.enableAndSignIn(b, email);
    await sa.memory.grantConsent(sa.ctx, sa.identity!, version);
    await sb.memory.grantConsent(sb.ctx, sb.identity!, version);
    await sa.memory.configure(adminContext(a.org.id), { retentionDays: 30 });
    const old = sql`now() - interval '31 days'`;
    for (const table of [
      'participant_memory_profile',
      'participant_memory_vehicle',
      'participant_memory_passenger',
    ])
      await handle.db.execute(
        sql`update ${sql.identifier(table)} set captured_at = ${old} where organization_id = ${a.org.id}`,
      );
    // The other tenant's data is older than A's retention but within its own (default 365 days).
    for (const table of [
      'participant_memory_profile',
      'participant_memory_vehicle',
      'participant_memory_passenger',
    ])
      await handle.db.execute(
        sql`update ${sql.identifier(table)} set captured_at = now() - interval '100 days' where organization_id = ${b.org.id}`,
      );
    const bBefore = await rows(participantMemoryProfiles, b.org.id);
    // Old but not yet cleaned up: already invisible.
    expect((await view(sa))!.offer).toBeNull();
    const cleanup = createParticipantMemoryCleanup(handle.db, {
      defaultDays: 365,
      minimumDays: 30,
      maximumDays: 1095,
    });
    const result = await cleanup.cleanupOrganization(a.org.id);
    expect(result.removed).toBeGreaterThanOrEqual(3);
    expect(result.consentsClosed).toBe(0); // consent is younger than the retention
    for (const table of [
      participantMemoryProfiles,
      participantMemoryVehicles,
      participantMemoryPassengers,
    ] as const)
      expect(await rows(table, a.org.id)).toHaveLength(0);
    // The other tenant's data, with the same e-mail, was not touched.
    expect(await rows(participantMemoryProfiles, b.org.id)).toEqual(bBefore);
    expect((await view(sb))!.offer).not.toBeNull();
    // Consent without data is closed once it is older than the retention.
    await handle.db
      .update(participantMemoryConsents)
      .set({ grantedAt: sql`now() - interval '40 days'` })
      .where(eq(participantMemoryConsents.organizationId, a.org.id));
    expect((await cleanup.cleanupOrganization(a.org.id)).consentsClosed).toBe(
      1,
    );
    const [closed] = await handle.db
      .select()
      .from(participantMemoryConsents)
      .where(eq(participantMemoryConsents.organizationId, a.org.id));
    expect(closed?.revokedReason).toBe('expired');
  });

  it('cleans up in batches without holding locks that block registrations', async () => {
    const fx = f();
    const t = await fx.tenant('Batch');
    const memory = fx.repository();
    await memory.configure(adminContext(t.org.id), { enabled: true });
    await handle.db.insert(participantMemoryProfiles).values(
      Array.from({ length: 12 }, (_, i) => ({
        organizationId: t.org.id,
        email: `p${i}@example.test`,
        firstName: 'X',
        lastName: 'Y',
        sourceEventName: 'E',
        sourceEventStartsOn: '2026-01-01',
        capturedAt: new Date(Date.now() - 400 * 86_400_000),
      })),
    );
    const cleanup = createParticipantMemoryCleanup(
      handle.db,
      { defaultDays: 365, minimumDays: 30, maximumDays: 1095 },
      5,
    );
    const writes = fx.registration(t, { email: 'parallel@example.test' });
    const result = await cleanup.cleanupOrganization(t.org.id);
    await writes;
    expect(result.removed).toBe(12);
    expect(await rows(participantMemoryProfiles, t.org.id)).toHaveLength(0);
  });

  it('refreshes the memory of a consenting participant on a later verification and never breaks it', async () => {
    const fx = f();
    const t = await fx.tenant('Refresh');
    await fx.registration(t, { email });
    const s = await fx.enableAndSignIn(t, email);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    const second = await fx.registration(t, {
      email,
      event: 'next',
      make: 'Lancia',
      vin: null,
    });
    await handle.db.transaction((tx) =>
      refreshParticipantMemoryForGroup(tx, t.org.id, second.group.id),
    );
    expect(await rows(participantMemoryVehicles, t.org.id)).toHaveLength(2);
    // Only verified entries are captured: an unverified later registration changes nothing.
    const stable = (list: Record<string, unknown>[]) =>
      list.map((row) => ({ ...row, capturedAt: null }));
    const before = stable(await rows(participantMemoryProfiles, t.org.id));
    const unverified = await fx.registration(t, {
      email,
      event: 'past',
      make: 'Unverified',
      vin: null,
      verified: false,
    });
    await handle.db.transaction((tx) =>
      refreshParticipantMemoryForGroup(tx, t.org.id, unverified.group.id),
    );
    expect(stable(await rows(participantMemoryProfiles, t.org.id))).toEqual(
      before,
    );
    expect(
      (await rows(participantMemoryVehicles, t.org.id)).map((v) => v.make),
    ).not.toContain('Unverified');
    // Without consent nothing is captured.
    const other = await fx.tenant('RefreshOther');
    const unconsented = await fx.registration(other, { email });
    await fx
      .repository()
      .configure(adminContext(other.org.id), { enabled: true });
    await handle.db.transaction((tx) =>
      refreshParticipantMemoryForGroup(tx, other.org.id, unconsented.group.id),
    );
    expect(await rows(participantMemoryProfiles, other.org.id)).toHaveLength(0);
    // A failing capture stays inside its savepoint: the surrounding transaction commits.
    await handle.db.transaction(async (tx) => {
      await refreshParticipantMemoryForGroup(tx, 'not-a-uuid', 'not-a-uuid');
      await tx.execute(sql`select 1`);
    });
  });
});
