import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { TransactionDatabase } from './database.js';
import { entries } from './schema/entries.js';
import { entryDocuments, eventEntryDocumentTypes } from './schema/documents.js';
import { participantMemoryDocuments } from './participant-memory-schema.js';

/**
 * Documents an organizer reviewed and that carry an expiry date, from the verified
 * entries of this person. The stored set is exactly this set: a document that was
 * rejected, whose entry was deleted or whose date is gone leaves the memory with it.
 */
export async function captureDocuments(
  tx: TransactionDatabase,
  organizationId: string,
  email: string,
  verified: SQL | undefined,
) {
  const documents = await tx
    .select({
      typeKey: entryDocuments.typeKey,
      typeName: eventEntryDocumentTypes.name,
      objectId: entryDocuments.objectId,
      validUntil: entryDocuments.validUntil,
      fileName: entryDocuments.fileName,
      contentType: entryDocuments.contentType,
      size: entryDocuments.size,
      sha256: entryDocuments.sha256,
      reviewedAt: entryDocuments.reviewedAt,
      uploadedAt: entryDocuments.uploadedAt,
    })
    .from(entryDocuments)
    .innerJoin(
      entries,
      and(
        eq(entries.organizationId, entryDocuments.organizationId),
        eq(entries.id, entryDocuments.entryId),
      ),
    )
    .innerJoin(
      eventEntryDocumentTypes,
      and(
        eq(
          eventEntryDocumentTypes.organizationId,
          entryDocuments.organizationId,
        ),
        eq(eventEntryDocumentTypes.eventId, entryDocuments.eventId),
        eq(eventEntryDocumentTypes.key, entryDocuments.typeKey),
      ),
    )
    .where(
      and(
        verified,
        eq(entryDocuments.status, 'reviewed'),
        sql`${entryDocuments.validUntil} is not null`,
      ),
    );
  const keep = new Set<string>();
  for (const { reviewedAt, uploadedAt, ...document } of documents) {
    keep.add(document.objectId);
    const capturedAt = reviewedAt ?? uploadedAt;
    await tx
      .insert(participantMemoryDocuments)
      .values({
        organizationId,
        email,
        ...document,
        validUntil: String(document.validUntil),
        capturedAt,
      })
      .onConflictDoUpdate({
        target: [
          participantMemoryDocuments.organizationId,
          participantMemoryDocuments.email,
          participantMemoryDocuments.typeKey,
          participantMemoryDocuments.objectId,
        ],
        set: { validUntil: String(document.validUntil), capturedAt },
      });
  }
  await tx
    .delete(participantMemoryDocuments)
    .where(
      and(
        eq(participantMemoryDocuments.organizationId, organizationId),
        eq(participantMemoryDocuments.email, email),
        keep.size
          ? notInArray(participantMemoryDocuments.objectId, [...keep])
          : undefined,
      ),
    );
}
