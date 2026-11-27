import { and, eq, sql } from 'drizzle-orm';
import type { ParticipantMemoryIdentity } from '@nennbox/core';
import type { TransactionDatabase } from './database.js';
import { entries, registrationGroups } from './schema/entries.js';
import { entryDocuments } from './schema/documents.js';

type OfferedDocument = {
  id: string;
  typeKey: string;
  objectId: string;
  validUntil: unknown;
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
};

/**
 * Copies one offered document onto an entry of the same verified e-mail, event and organization.
 * Returns null when the document or the target entry is not the participant's.
 */
export async function adoptMemoryDocument(
  tx: TransactionDatabase,
  identity: ParticipantMemoryIdentity,
  state: { org: string; event: { id: string } },
  wanted: { id: string; entryId: string },
  document: OfferedDocument | undefined,
) {
  // The target entry must belong to this verified e-mail, in this event and organization.
  const [entry] = await tx
    .select({ id: entries.id })
    .from(entries)
    .innerJoin(
      registrationGroups,
      and(
        eq(registrationGroups.organizationId, entries.organizationId),
        eq(registrationGroups.id, entries.registrationGroupId),
      ),
    )
    .where(
      and(
        eq(entries.organizationId, state.org),
        eq(entries.eventId, state.event.id),
        eq(entries.id, wanted.entryId),
        eq(entries.verificationStatus, 'verified'),
        sql`${entries.deletedAt} is null`,
        sql`lower(trim(${registrationGroups.contactEmail})) = ${identity.email}`,
      ),
    );
  if (!document || !entry) return null;
  const [existing] = await tx
    .select({ id: entryDocuments.id })
    .from(entryDocuments)
    .where(
      and(
        eq(entryDocuments.organizationId, state.org),
        eq(entryDocuments.entryId, entry.id),
        eq(entryDocuments.typeKey, document.typeKey),
        eq(entryDocuments.objectId, document.objectId),
      ),
    );
  const [created] = existing
    ? [existing]
    : await tx
        .insert(entryDocuments)
        .values({
          organizationId: state.org,
          eventId: state.event.id,
          entryId: entry.id,
          typeKey: document.typeKey,
          objectId: document.objectId,
          validUntil: String(document.validUntil),
          fileName: document.fileName,
          contentType: document.contentType,
          size: document.size,
          sha256: document.sha256,
          uploadedBy: 'participant-memory',
        })
        .returning({ id: entryDocuments.id });
  return {
    id: document.id,
    entryId: entry.id,
    entryDocumentId: created!.id,
  };
}
