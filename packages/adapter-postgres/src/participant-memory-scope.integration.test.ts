import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participantMemoryConsentTerms } from '@nennbox/core';
import {
  createDatabase,
  entries,
  entryDocuments,
  entryPassengers,
  events,
  migrate,
  organizations,
  people,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemoryVehicles,
  refreshParticipantMemoryForGroup,
  registrationGroups,
} from './index.js';
import { memoryFixture } from './participant-memory-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const version = participantMemoryConsentTerms.version;
const slug = 'bergpreis-2030';

/**
 * Scope rules of the capture that the other suites do not isolate (review of #245, P1-1/P1-2,
 * mutations N3, N5, N11, N21). Another driver inside one group cannot exist: the entry's driver
 * is bound to the group's person by foreign key, so that rule needs no test of its own.
 */
describe.skipIf(!url)('participant memory: scope of one capture', () => {
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
  const person = async (org: string, firstName: string, own: string | null) =>
    handle.db
      .insert(people)
      .values({
        organizationId: org,
        firstName,
        lastName: 'Dritte',
        country: 'DE',
        ...(own ? { email: own, emailNormalized: own } : {}),
      })
      .returning()
      .then((rows) => rows[0]!);
  const consenting = async (
    t: Awaited<ReturnType<ReturnType<typeof f>['tenant']>>,
  ) => {
    const s = await f().enableAndSignIn(t, email);
    expect(await s.memory.grantConsent(s.ctx, s.identity!, version)).toBe(true);
    return s;
  };

  it('entries of the same group beyond the retention period stay out of vehicles, co-drivers and documents', async () => {
    const fx = f();
    const t = await fx.tenant('Gruppe');
    const reg = await fx.registration(t, { email, firstName: 'Eigen' });
    const old = await fx.extraEntry(t, reg, {
      make: 'Uralt',
      verified: true,
      passenger: true,
    });
    await fx.document(t, old.entry.id, '2031-01-01');
    await handle.db
      .update(entries)
      .set({ createdAt: sql`now() - interval '800 days'` })
      .where(eq(entries.id, old.entry.id));
    await consenting(t);
    const all = await stored(t.org.id);
    expect(all.profiles).toHaveLength(1);
    expect(all.vehicles.map((v) => v.make)).toEqual(['Porsche']);
    expect(all.passengers).toHaveLength(0);
    expect(all.documents).toHaveLength(0);
  });

  it('a co-driver whose details are not completed yet is not captured', async () => {
    const fx = f();
    const t = await fx.tenant('Offen');
    await fx.registration(t, { email, passenger: true });
    await handle.db
      .update(entryPassengers)
      .set({ completedAt: null })
      .where(eq(entryPassengers.organizationId, t.org.id));
    await consenting(t);
    expect((await stored(t.org.id)).passengers).toHaveLength(0);
    expect((await stored(t.org.id)).profiles).toHaveLength(1);
  });

  it('a second person appearing under the address closes the offer at once, before any refresh runs', async () => {
    const fx = f();
    const t = await fx.tenant('Zweite');
    await fx.registration(t, { email, firstName: 'Eigen' });
    const s = await consenting(t);
    expect((await stored(t.org.id)).profiles).toHaveLength(1);
    expect(
      (await s.memory.view(s.ctx, s.identity!, slug))!.offer,
    ).not.toBeNull();
    // Written past the application hooks, as a bulk import or a manual correction would.
    await person(t.org.id, 'Zugezogen', email);
    expect((await stored(t.org.id)).profiles).toHaveLength(1);
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

  it('a refresh removes a captured document that its source no longer supports', async () => {
    const fx = f();
    const t = await fx.tenant('Nachlauf');
    const reg = await fx.registration(t, { email });
    const doc = await fx.document(t, reg.entry.id, '2031-01-01');
    await consenting(t);
    expect((await stored(t.org.id)).documents).toHaveLength(1);
    await handle.db
      .update(entryDocuments)
      .set({ status: 'rejected', rejectionReason: 'unleserlich' })
      .where(eq(entryDocuments.id, doc.id));
    await handle.db.transaction((tx) =>
      refreshParticipantMemoryForGroup(tx, t.org.id, reg.group.id),
    );
    expect((await stored(t.org.id)).documents).toHaveLength(0);
    expect((await stored(t.org.id)).profiles).toHaveLength(1);
  });
});
