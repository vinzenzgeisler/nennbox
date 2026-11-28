import { and, eq, or, sql } from 'drizzle-orm';
import { normalizeTeamEmail } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { entries, people, registrationGroups } from './schema/entries.js';
import { captureParticipantMemory } from './participant-memory-capture.js';
import {
  lockParticipant,
  memoryEnabled,
} from './participant-memory-support.js';

/** The source a change happened at; the addresses whose memory may depend on it are looked up from it. */
export type ParticipantMemorySource =
  { entryId: string } | { personId: string } | { vehicleId: string };

const addressesOf = async (
  tx: TransactionDatabase,
  organizationId: string,
  source: ParticipantMemorySource,
): Promise<Set<string | null>> => {
  const emails = new Set<string | null>();
  const fromGroups = async (match: ReturnType<typeof eq> | undefined) => {
    const rows = await tx
      .select({ email: registrationGroups.contactEmail })
      .from(entries)
      .innerJoin(
        registrationGroups,
        and(
          eq(registrationGroups.organizationId, entries.organizationId),
          eq(registrationGroups.id, entries.registrationGroupId),
        ),
      )
      .where(and(eq(entries.organizationId, organizationId), match));
    for (const row of rows) emails.add(row.email);
  };
  if ('entryId' in source) await fromGroups(eq(entries.id, source.entryId));
  else if ('vehicleId' in source)
    await fromGroups(
      or(
        eq(entries.vehicleId, source.vehicleId),
        eq(entries.spareVehicleId, source.vehicleId),
      ),
    );
  else {
    await fromGroups(eq(entries.driverPersonId, source.personId));
    const groups = await tx
      .select({ email: registrationGroups.contactEmail })
      .from(registrationGroups)
      .where(
        and(
          eq(registrationGroups.organizationId, organizationId),
          eq(registrationGroups.personId, source.personId),
        ),
      );
    for (const row of groups) emails.add(row.email);
    // The person's own address decides who the owner of an address is.
    const [own] = await tx
      .select({ email: sql<string | null>`${people.emailNormalized}` })
      .from(people)
      .where(
        and(
          eq(people.organizationId, organizationId),
          eq(people.id, source.personId),
        ),
      );
    emails.add(own?.email ?? null);
  }
  return emails;
};

/**
 * Called inside the transaction that deleted or changed a source (entry, person,
 * vehicle, document review): brings the memory of every affected address back in
 * line with the sources, in the same transaction. Failures are not swallowed:
 * an erasure that leaves its copy behind must fail loudly.
 */
export async function reconcileParticipantMemory(
  executor: TransactionDatabase | Database,
  organizationId: string,
  source: ParticipantMemorySource,
): Promise<void> {
  // Callers hand in the transaction they are already in.
  const tx = executor as TransactionDatabase;
  if (!(await memoryEnabled(tx, organizationId))) return;
  const done = new Set<string>();
  for (const raw of await addressesOf(tx, organizationId, source)) {
    let email: string;
    try {
      if (!raw) continue;
      email = normalizeTeamEmail(raw);
    } catch {
      continue;
    }
    if (done.has(email)) continue;
    done.add(email);
    await lockParticipant(tx, organizationId, email);
    await captureParticipantMemory(tx, organizationId, email);
  }
}
