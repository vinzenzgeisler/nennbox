import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participantMemoryConsentTerms } from '@nennbox/core';
import {
  createDatabase,
  createPersonRepository,
  entries,
  events,
  migrate,
  organizations,
  participantMemoryConsents,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryVehicles,
  registrationGroups,
} from './index.js';
import { memoryFixture, publicContext } from './participant-memory-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const version = participantMemoryConsentTerms.version;
const slug = 'bergpreis-2030';

/** The memory belongs to a person, not to a contact address (review of #245, P1-1, probe R4). */
describe.skipIf(!url)('participant memory: scoped to the person', () => {
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
  const stored = async (org: string) => ({
    profiles: await handle.db
      .select()
      .from(participantMemoryProfiles)
      .where(eq(participantMemoryProfiles.organizationId, org)),
    vehicles: await handle.db
      .select()
      .from(participantMemoryVehicles)
      .where(eq(participantMemoryVehicles.organizationId, org)),
    passengers: await handle.db
      .select()
      .from(participantMemoryPassengers)
      .where(eq(participantMemoryPassengers.organizationId, org)),
    documents: await handle.db
      .select()
      .from(participantMemoryDocuments)
      .where(eq(participantMemoryDocuments.organizationId, org)),
  });
  const signedIn = async (
    t: Awaited<ReturnType<ReturnType<typeof f>['tenant']>>,
  ) => {
    const s = await f().enableAndSignIn(t, email);
    expect(await s.memory.grantConsent(s.ctx, s.identity!, version)).toBe(true);
    return s;
  };

  it('R4: an address that also names someone else identifies nobody, so nothing is remembered or offered', async () => {
    const fx = f();
    const t = await fx.tenant('Gemeinsam');
    await fx.registration(t, {
      email,
      firstName: 'Manager',
      lastName: 'Eigen',
    });
    await fx.registration(t, {
      email,
      firstName: 'Kollege',
      lastName: 'Fremd',
      make: 'BMW',
      event: 'next',
    });
    const s = await signedIn(t);
    const all = await stored(t.org.id);
    expect(Object.values(all).flat()).toHaveLength(0);
    expect(await s.memory.view(s.ctx, s.identity!, slug)).toMatchObject({
      consent: { granted: true },
      offer: null,
    });
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: slug,
        driver: ['firstName'],
      }),
    ).toBeNull();
  });

  it('R4: when the other person is erased the address belongs to one person again, in the same transaction', async () => {
    const fx = f();
    const t = await fx.tenant('Aufloesung');
    await fx.registration(t, {
      email,
      firstName: 'Manager',
      lastName: 'Eigen',
    });
    const other = await fx.registration(t, {
      email,
      firstName: 'Kollege',
      lastName: 'Fremd',
      make: 'BMW',
      event: 'next',
    });
    const s = await signedIn(t);
    expect((await stored(t.org.id)).profiles).toHaveLength(0);
    await createPersonRepository(handle.db).softDelete(
      publicContext(t.org.id),
      other.person.id,
      'Löschbegehren Art. 17',
    );
    const after = await stored(t.org.id);
    expect(after.profiles).toHaveLength(1);
    expect(after.profiles[0]).toMatchObject({ firstName: 'Manager' });
    expect(after.vehicles.map((v) => v.make)).toEqual(['Porsche']);
    const offer = (await s.memory.view(s.ctx, s.identity!, slug))!.offer!;
    expect(JSON.stringify(offer)).not.toMatch(/Kollege|Fremd|BMW/);
  });

  it('R4: people named through the address with their own address are never taken over', async () => {
    const fx = f();
    const t = await fx.tenant('Familie');
    await fx.registration(t, {
      email,
      firstName: 'Eltern',
      lastName: 'Teil',
      licenseNumber: 'ELTERN-111111',
    });
    // The child is entered by the parent: contact address of the parent, the child's own address on the person.
    const child = await fx.registration(t, {
      email,
      personEmail: 'kind@example.test',
      firstName: 'Kind',
      lastName: 'Teil',
      make: 'Kart',
      vin: 'KARTVIN123456789',
      licenseNumber: 'KIND-999999',
      passenger: true,
      event: 'next',
    });
    await handle.db
      .update(registrationGroups)
      .set({
        bloodGroup: '0-',
        street: 'Kinderweg 1',
        emergencyContactName: 'Nur-Kind-Notfall',
      })
      .where(eq(registrationGroups.id, child.group.id));
    await fx.document(t, child.entry.id, '2031-01-01');
    const s = await signedIn(t);
    const all = await stored(t.org.id);
    expect(all.profiles).toHaveLength(1);
    expect(all.profiles[0]).toMatchObject({
      firstName: 'Eltern',
      licenseNumber: 'ELTERN-111111',
      bloodGroup: null,
      street: null,
    });
    expect(all.vehicles.map((v) => v.make)).toEqual(['Porsche']);
    expect(all.passengers).toHaveLength(0);
    expect(all.documents).toHaveLength(0);
    // Not in the offer, not in the database, not retrievable by id either.
    expect(JSON.stringify(all)).not.toMatch(
      /Kind|KARTVIN|KIND-999999|Kinderweg|Nur-Kind/,
    );
    expect(
      JSON.stringify(await s.memory.view(s.ctx, s.identity!, slug)),
    ).not.toMatch(/Kind|Kart|KIND-999999/);
  });

  it('a co-driver is kept as a pointer: name and e-mail, no personal data of the third party', async () => {
    const fx = f();
    const t = await fx.tenant('Beifahrer');
    await fx.registration(t, { email, passenger: true });
    const s = await signedIn(t);
    const [row] = (await stored(t.org.id)).passengers;
    expect(row).toMatchObject({
      firstName: 'Pat',
      lastName: 'Beifahrer',
      passengerEmail: 'pat@example.test',
    });
    expect(Object.keys(row!).sort()).toEqual(
      [
        'capturedAt',
        'email',
        'firstName',
        'lastName',
        'organizationId',
        'passengerEmail',
      ].sort(),
    );
    expect(JSON.stringify(row)).not.toContain('+49170999');
    const offer = (await s.memory.view(s.ctx, s.identity!, slug))!.offer!;
    expect(offer.passenger.map((field) => field.key).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
    ]);
  });

  it('only entries inside the retention period are captured, and consenting again does not prolong old data', async () => {
    const fx = f();
    const t = await fx.tenant('Frist');
    const old = await fx.registration(t, {
      email,
      make: 'Uralt',
      vin: null,
    });
    await handle.db
      .update(entries)
      .set({ createdAt: sql`now() - interval '800 days'` })
      .where(eq(entries.id, old.entry.id));
    await fx.registration(t, {
      email,
      make: 'Frisch',
      vin: null,
      event: 'next',
    });
    const memory = fx.repository();
    await memory.configure(
      (await import('./participant-memory-fixture.js')).adminContext(t.org.id),
      {
        enabled: true,
      },
    );
    const s = await fx.signIn(t, email);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    expect((await stored(t.org.id)).vehicles.map((v) => v.make)).toEqual([
      'Frisch',
    ]);
    // A participant whose only entries are older than the period gets an empty memory.
    const t2 = await fx.tenant('FristLeer');
    const only = await fx.registration(t2, { email });
    await handle.db
      .update(entries)
      .set({ createdAt: sql`now() - interval '800 days'` })
      .where(eq(entries.id, only.entry.id));
    const s2 = await fx.enableAndSignIn(t2, email);
    await s2.memory.grantConsent(s2.ctx, s2.identity!, version);
    expect(Object.values(await stored(t2.org.id)).flat()).toHaveLength(0);
    // The capture time follows the source, so consenting again leaves it where it was.
    const before = (await stored(t.org.id)).vehicles[0]!.capturedAt;
    await s.memory.revokeConsent(s.ctx, s.identity!);
    await s.memory.grantConsent(s.ctx, s.identity!, version);
    const [again] = (await stored(t.org.id)).vehicles;
    expect(
      Math.abs(again!.capturedAt.getTime() - before.getTime()),
    ).toBeLessThan(5_000);
    expect(again!.capturedAt.getTime()).toBeLessThan(Date.now() + 1);
  });

  it('a changed wording needs a new consent; the old one is closed as superseded', async () => {
    const fx = f();
    const t = await fx.tenant('Wortlaut');
    await fx.registration(t, { email });
    const s = await signedIn(t);
    expect(
      (await s.memory.view(s.ctx, s.identity!, slug))!.offer,
    ).not.toBeNull();
    await handle.db
      .update(participantMemoryConsents)
      .set({ wordingVersion: '2020-01-01.1' })
      .where(eq(participantMemoryConsents.organizationId, t.org.id));
    expect(await s.memory.view(s.ctx, s.identity!, slug)).toMatchObject({
      consent: { granted: false },
      offer: null,
    });
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: slug,
        driver: ['firstName'],
      }),
    ).toBeNull();
    expect(await s.memory.grantConsent(s.ctx, s.identity!, version)).toBe(true);
    const log = await handle.db
      .select()
      .from(participantMemoryConsents)
      .where(eq(participantMemoryConsents.organizationId, t.org.id));
    expect(log).toHaveLength(2);
    expect(log.map((row) => row.revokedReason)).toEqual(
      expect.arrayContaining(['superseded', null]),
    );
    expect(
      (await s.memory.view(s.ctx, s.identity!, slug))!.consent.granted,
    ).toBe(true);
  });

  it('only events open for registration can be asked about: draft and archived slugs look like unknown ones', async () => {
    const fx = f();
    const t = await fx.tenant('Entwurf');
    await fx.registration(t, { email });
    const s = await signedIn(t);
    expect(await s.memory.view(s.ctx, s.identity!, slug)).not.toBeNull();
    for (const status of ['draft', 'closed', 'archived'])
      await handle.db
        .update(events)
        .set({ status })
        .where(and(eq(events.organizationId, t.org.id), eq(events.slug, slug)));
    const unknown = await s.memory.view(s.ctx, s.identity!, 'gibts-nicht');
    expect(unknown).toBeNull();
    expect(await s.memory.view(s.ctx, s.identity!, slug)).toEqual(unknown);
    expect(
      await s.memory.take(s.ctx, s.identity!, {
        eventSlug: slug,
        driver: ['firstName'],
      }),
    ).toBeNull();
  });

  it('what is not verified is never captured: vehicle, co-driver and document of an unverified entry stay out', async () => {
    const fx = f();
    const t = await fx.tenant('Unbestaetigt');
    const reg = await fx.registration(t, { email });
    // Same registration group as the verified entry, but this entry itself is not confirmed.
    const open = await fx.extraEntry(t, reg, {
      make: 'Unbestaetigt',
      verified: false,
      passenger: true,
    });
    await fx.document(t, open.entry.id, '2031-01-01');
    await signedIn(t);
    const all = await stored(t.org.id);
    expect(all.vehicles.map((v) => v.make)).toEqual(['Porsche']);
    expect(all.passengers).toHaveLength(0);
    expect(all.documents).toHaveLength(0);
  });

  it('a document type that is switched off for the event is not offered', async () => {
    const fx = f();
    const t = await fx.tenant('TypAus', '2030-06-02');
    const reg = await fx.registration(t, { email });
    await fx.document(t, reg.entry.id, '2031-01-01');
    const s = await signedIn(t);
    expect(
      (await s.memory.view(s.ctx, s.identity!, slug))!.offer!.documents,
    ).toHaveLength(1);
    await handle.db.execute(
      sql`update event_entry_document_type set enabled = false where organization_id = ${t.org.id}`,
    );
    expect(
      (await s.memory.view(s.ctx, s.identity!, slug))!.offer!.documents,
    ).toHaveLength(0);
  });

  it('consent can only be given for an address that was verified', async () => {
    const fx = f();
    const t = await fx.tenant('Unbekannt');
    await fx.registration(t, { email, verified: false });
    const s = await fx.enableAndSignIn(t, email);
    const forged = { organizationId: t.org.id, email };
    expect(await s.memory.grantConsent(s.ctx, forged, version)).toBe(false);
    expect(
      await handle.db
        .select()
        .from(participantMemoryConsents)
        .where(eq(participantMemoryConsents.organizationId, t.org.id)),
    ).toHaveLength(0);
  });
});
