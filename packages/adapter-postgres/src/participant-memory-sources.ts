import { and, eq } from 'drizzle-orm';
import { entries, entryDocuments, entryPassengers, vehicles } from './index.js';
import type { TestDb } from './participant-memory-context.js';

/** Extra source rows for the tests: another entry of a group, a reviewed document. */
export function participantMemorySources(db: TestDb) {
  /** A further entry of an existing registration group: its own vehicle, optionally a co-driver. */
  const extraEntry = async (
    t: { org: { id: string } },
    reg: {
      person: { id: string };
      group: { id: string; eventId: string };
      entry: { classId: string };
    },
    input: { make: string; verified: boolean; passenger?: boolean },
  ) => {
    const org = t.org.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ organizationId: org, make: input.make, model: 'Extra' })
      .returning();
    const [entry] = await db
      .insert(entries)
      .values({
        organizationId: org,
        eventId: reg.group.eventId,
        classId: reg.entry.classId,
        registrationGroupId: reg.group.id,
        driverPersonId: reg.person.id,
        vehicleId: vehicle!.id,
        orgaCode: `EX-${crypto.randomUUID().slice(0, 12)}`,
        verificationStatus: input.verified ? 'verified' : 'unverified',
      })
      .returning();
    if (input.passenger)
      await db.insert(entryPassengers).values({
        organizationId: org,
        eventId: reg.group.eventId,
        entryId: entry!.id,
        firstName: 'Extra',
        lastName: 'Beifahrer',
        email: 'extra@example.test',
        source: 'registration',
        createdBy: 'test',
        completedAt: new Date(),
      });
    return { vehicle: vehicle!, entry: entry! };
  };
  const document = async (
    t: { org: { id: string } },
    entryId: string,
    validUntil: string | null,
    status: 'reviewed' | 'uploaded' = 'reviewed',
  ) => {
    const [source] = await db
      .select({ eventId: entries.eventId })
      .from(entries)
      .where(
        and(eq(entries.organizationId, t.org.id), eq(entries.id, entryId)),
      );
    return db
      .insert(entryDocuments)
      .values({
        organizationId: t.org.id,
        eventId: source!.eventId,
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
  };
  return { extraEntry, document };
}
