import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
  createRequestContext,
  organizationId,
  permissionsForRole,
  staticCanonicalOrigin,
  type ParticipantMemoryRepository,
} from '@nennbox/core';
import {
  createDatabase,
  createEntryRepository,
  createParticipantMemoryRepository,
  deriveParticipantMemoryToken,
  emailOutbox,
  entries,
  entryDocuments,
  entryPassengers,
  eventClasses,
  eventEntryDocumentTypes,
  events,
  organizations,
  participantMemoryAccess,
  people,
  registrationGroups,
  vehicles,
} from './index.js';

export const tokenKey = 'c'.repeat(64);
export const origin = staticCanonicalOrigin('https://memory.example.test');
export type TestDb = Awaited<ReturnType<typeof createDatabase>>['db'];

export const publicContext = (org: string) =>
  createRequestContext({
    deploymentMode: 'community',
    organizationId: organizationId(org),
    permissions: new Set(),
    capabilities: new Set(),
    correlationId: crypto.randomUUID(),
  });
export const adminContext = (org: string, role: 'admin' | 'viewer' = 'admin') =>
  createRequestContext({
    deploymentMode: 'community',
    organizationId: organizationId(org),
    subject: {
      issuer: 'https://id.example.test',
      subject: crypto.randomUUID(),
    },
    permissions: permissionsForRole(role),
    capabilities: new Set(),
    correlationId: crypto.randomUUID(),
  });

export function memoryFixture(db: TestDb, organizationIds: string[]) {
  const repository = (): ParticipantMemoryRepository =>
    createParticipantMemoryRepository(db, {
      tokenKey,
      canonicalOrigin: origin,
    });
  /** An organization with one event (ends on `endsOn`) that asks for a "licence" document. */
  const tenant = async (name: string, endsOn = '2030-06-02') => {
    const [org] = await db
      .insert(organizations)
      .values({
        slug: `memory-${name}-${crypto.randomUUID()}`,
        name,
        timezone: 'UTC',
        locale: 'de',
      })
      .returning();
    organizationIds.push(org!.id);
    const make = async (slug: string, startsOn: string, ends: string) => {
      const [event] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          slug,
          orgaCodePrefix: 'MEM',
          name: `${name} ${slug}`,
          startsOn,
          endsOn: ends,
        })
        .returning();
      const [eventClass] = await db
        .insert(eventClasses)
        .values({
          organizationId: org!.id,
          eventId: event!.id,
          name: 'Touring',
          code: 'TOUR',
          vehicleType: 'car',
        })
        .returning();
      await db.insert(eventEntryDocumentTypes).values({
        organizationId: org!.id,
        eventId: event!.id,
        key: 'licence',
        name: 'Lizenz',
        required: false,
      });
      return { event: event!, eventClass: eventClass! };
    };
    const past = await make('bergpreis-2026', '2026-06-01', '2026-06-02');
    const next = await make('bergpreis-2030', '2030-06-01', endsOn);
    return { org: org!, past, next };
  };
  type Tenant = Awaited<ReturnType<typeof tenant>>;
  /** A registration (group + driver + vehicle + entry), verified unless told otherwise. */
  const registration = async (
    t: Tenant,
    input: {
      email: string;
      firstName?: string;
      lastName?: string;
      make?: string;
      vin?: string | null;
      verified?: boolean;
      event?: 'past' | 'next';
      passenger?: boolean;
      licenseNumber?: string;
    },
  ) => {
    const where = t[input.event ?? 'past'];
    const org = t.org.id;
    const [person] = await db
      .insert(people)
      .values({
        organizationId: org,
        firstName: input.firstName ?? 'Alex',
        lastName: input.lastName ?? t.org.name,
        country: 'DE',
      })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        organizationId: org,
        make: input.make ?? 'Porsche',
        model: '911',
        year: 1973,
        registration: 'S-AB 123',
        ...(input.vin === undefined
          ? { vin: 'WP0ZZZ91ZDS123456' }
          : { vin: input.vin }),
      })
      .returning();
    const [group] = await db
      .insert(registrationGroups)
      .values({
        organizationId: org,
        eventId: where.event.id,
        personId: person!.id,
        contactEmail: input.email,
        phone: '+491701234567',
        licenseNumber: input.licenseNumber ?? 'DMSB-998877',
      })
      .returning();
    const entry = await createEntryRepository(db).create!(
      createRequestContext({
        deploymentMode: 'community',
        organizationId: organizationId(org),
        permissions: new Set(['entry:read', 'entry:write']),
        capabilities: new Set(),
        correlationId: crypto.randomUUID(),
      }),
      {
        eventId: where.event.id,
        classId: where.eventClass.id,
        registrationGroupId: group!.id,
        driverPersonId: person!.id,
        vehicleId: vehicle!.id,
        requestedStartNumber: null,
        priceSnapshotVersion: null,
        priceSnapshot: null,
        formSnapshotVersion: null,
      },
    );
    if (input.verified ?? true)
      await db
        .update(entries)
        .set({ verificationStatus: 'verified' })
        .where(and(eq(entries.organizationId, org), eq(entries.id, entry.id)));
    if (input.passenger)
      await db.insert(entryPassengers).values({
        organizationId: org,
        eventId: where.event.id,
        entryId: entry.id,
        firstName: 'Pat',
        lastName: 'Beifahrer',
        email: 'pat@example.test',
        phone: '+49170999',
        source: 'registration',
        createdBy: 'test',
        completedAt: new Date(),
      });
    return { person: person!, vehicle: vehicle!, group: group!, entry };
  };
  const document = (
    t: Tenant,
    entryId: string,
    validUntil: string | null,
    status: 'reviewed' | 'uploaded' = 'reviewed',
  ) =>
    db
      .insert(entryDocuments)
      .values({
        organizationId: t.org.id,
        eventId: t.past.event.id,
        entryId,
        typeKey: 'licence',
        objectId: crypto.randomUUID(),
        validUntil,
        fileName: 'lizenz.pdf',
        contentType: 'application/pdf',
        size: 1234,
        sha256: 'a'.repeat(64),
        uploadedBy: 'test',
        ...(status === 'reviewed'
          ? { status, reviewedAt: new Date(), reviewedBy: 'office' }
          : {}),
      })
      .returning()
      .then((rows) => rows[0]!);
  /** The bearer the worker would put into the mail, rebuilt from the outbox nonce. */
  const mailedToken = async (
    org: string,
    purpose: 'access' | 'delete',
    email: string,
  ) => {
    const rows = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.organizationId, org),
          eq(emailOutbox.recipient, email),
          eq(
            emailOutbox.templateKey,
            purpose === 'access'
              ? 'participant-memory-link'
              : 'participant-memory-delete',
          ),
        ),
      );
    // The newest access row identifies the current delivery; outbox order is no guarantee.
    const [current] = await db
      .select({ tokenHash: participantMemoryAccess.tokenHash })
      .from(participantMemoryAccess)
      .where(
        and(
          eq(participantMemoryAccess.organizationId, org),
          eq(participantMemoryAccess.email, email),
          eq(participantMemoryAccess.purpose, purpose),
        ),
      )
      .orderBy(desc(participantMemoryAccess.createdAt))
      .limit(1);
    for (const row of rows) {
      const token = deriveParticipantMemoryToken(
        tokenKey,
        purpose,
        row.variables.accessNonce!,
      );
      if (
        createHash('sha256').update(token).digest('hex') === current?.tokenHash
      )
        return token;
    }
    return null;
  };
  /** Enable the feature and open a participant session through the real magic link. */
  const enableAndSignIn = async (t: Tenant, email: string) => {
    const memory = repository();
    await memory.configure(adminContext(t.org.id), { enabled: true });
    return signIn(t, email);
  };
  const signIn = async (t: Tenant, email: string) => {
    const memory = repository();
    const ctx = publicContext(t.org.id);
    await memory.requestAccess(ctx, email, 'access', 'de');
    const token = await mailedToken(t.org.id, 'access', email);
    const session = token ? await memory.redeemAccess(ctx, token) : null;
    const identity = session ? await memory.session(ctx, session) : null;
    return { memory, ctx, token, session, identity };
  };
  return {
    repository,
    tenant,
    registration,
    document,
    mailedToken,
    enableAndSignIn,
    signIn,
  };
}
