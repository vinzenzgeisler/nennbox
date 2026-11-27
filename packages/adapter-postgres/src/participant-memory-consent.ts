import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  effectiveParticipantMemoryRetentionDays,
  participantMemoryConsentTerms,
  ProviderError,
  type ParticipantMemoryBounds,
  type ParticipantMemoryIdentity,
  type ParticipantMemorySettings,
  type RequestContext,
} from '@nennbox/core';
import type { Database } from './database.js';
import { verifiedEmailKnown } from './participant-memory-access.js';
import { participantMemoryEmailHash } from './participant-memory-token.js';
import { captureParticipantMemory } from './participant-memory-capture.js';
import {
  participantMemoryAccess,
  participantMemoryConsents,
  participantMemoryDocuments,
  participantMemoryPassengers,
  participantMemoryProfiles,
  participantMemorySettings,
  participantMemoryVehicles,
} from './participant-memory-schema.js';
import {
  closeConsent,
  loadSettings,
  lockOrganization,
  lockParticipant,
  memoryEnabled,
  openConsent,
  purgeParticipant,
} from './participant-memory-support.js';

export const consentWordingHash = () =>
  createHash('sha256')
    .update(
      JSON.stringify([
        participantMemoryConsentTerms.version,
        participantMemoryConsentTerms.text.de,
        participantMemoryConsentTerms.text.en,
      ]),
    )
    .digest('hex');

export function createParticipantMemoryConsent(
  db: Database,
  bounds: ParticipantMemoryBounds,
  tokenKey: string,
) {
  const readSettings = async (
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    organizationId: string,
  ): Promise<ParticipantMemorySettings> => {
    const row = await loadSettings(tx, organizationId);
    const [{ count }] = (await tx
      .select({
        count: sql<number>`count(distinct ${participantMemoryProfiles.email})::int`,
      })
      .from(participantMemoryProfiles)
      .where(eq(participantMemoryProfiles.organizationId, organizationId))) as [
      { count: number },
    ];
    return {
      enabled: row?.enabled ?? false,
      retentionDays: row?.retentionDays ?? null,
      effectiveRetentionDays: effectiveParticipantMemoryRetentionDays(
        row?.retentionDays,
        bounds,
      ),
      bounds,
      storedParticipants: count,
    };
  };
  const requireAdmin = (ctx: RequestContext) => {
    if (!ctx.permissions.has('organization:update'))
      throw new ProviderError('forbidden', 'forbidden');
  };
  return {
    settings: async (ctx: RequestContext) => {
      requireAdmin(ctx);
      return db.transaction((tx) => readSettings(tx, ctx.organizationId));
    },
    configure: async (
      ctx: RequestContext,
      input: {
        enabled?: boolean | undefined;
        retentionDays?: number | null | undefined;
      },
    ) => {
      requireAdmin(ctx);
      const days = input.retentionDays;
      if (
        days !== undefined &&
        days !== null &&
        (!Number.isSafeInteger(days) ||
          days < bounds.minimumDays ||
          days > bounds.maximumDays)
      )
        throw new ProviderError('invalid_input', 'invalid_input');
      return db.transaction(async (tx) => {
        const org = ctx.organizationId;
        await lockOrganization(tx, org);
        const before = await loadSettings(tx, org);
        const enabled = input.enabled ?? before?.enabled ?? false;
        const retentionDays =
          days === undefined ? (before?.retentionDays ?? null) : days;
        const change = {
          enabled,
          retentionDays,
          updatedAt: new Date(),
          updatedByIssuer: ctx.subject?.issuer ?? null,
          updatedBySubject: ctx.subject?.subject ?? null,
        };
        await tx
          .insert(participantMemorySettings)
          .values({ organizationId: org, ...change })
          .onConflictDoUpdate({
            target: participantMemorySettings.organizationId,
            set: change,
          });
        let purged = 0;
        // Switching off stops the processing: stored data goes, consent must be given anew.
        if (!enabled) {
          for (const table of [
            participantMemoryProfiles,
            participantMemoryVehicles,
            participantMemoryPassengers,
            participantMemoryDocuments,
          ] as const)
            purged += (
              await tx
                .delete(table)
                .where(eq(table.organizationId, org))
                .returning({ email: table.email })
            ).length;
          await tx
            .update(participantMemoryConsents)
            .set({
              revokedAt: new Date(),
              revokedReason: 'disabled',
              email: null,
            })
            .where(
              and(
                eq(participantMemoryConsents.organizationId, org),
                sql`${participantMemoryConsents.revokedAt} is null`,
              ),
            );
          await tx
            .update(participantMemoryAccess)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(participantMemoryAccess.organizationId, org),
                sql`${participantMemoryAccess.revokedAt} is null`,
              ),
            );
        }
        return { ...(await readSettings(tx, org)), purged };
      });
    },
    async grantConsent(
      _ctx: RequestContext,
      identity: ParticipantMemoryIdentity,
      wordingVersion: string,
    ) {
      if (wordingVersion !== participantMemoryConsentTerms.version)
        return false;
      return db.transaction(async (tx) => {
        const { organizationId: org, email } = identity;
        await lockParticipant(tx, org, email);
        if (
          !(await memoryEnabled(tx, org)) ||
          !(await verifiedEmailKnown(tx, org, email))
        )
          return false;
        const open = await openConsent(tx, org, email);
        // A consent given under an older wording does not cover the new text: close it, ask anew.
        if (open && open.wordingVersion !== wordingVersion)
          await closeConsent(tx, org, email, 'superseded');
        if (!open || open.wordingVersion !== wordingVersion)
          await tx.insert(participantMemoryConsents).values({
            organizationId: org,
            email,
            emailHash: participantMemoryEmailHash(tokenKey, org, email),
            wordingVersion,
            wordingHash: consentWordingHash(),
          });
        await captureParticipantMemory(tx, org, email);
        return true;
      });
    },
    revokeConsent: (
      _ctx: RequestContext,
      identity: ParticipantMemoryIdentity,
    ) =>
      db.transaction(async (tx) => {
        const { organizationId: org, email } = identity;
        await lockParticipant(tx, org, email);
        await purgeParticipant(tx, org, email);
        await closeConsent(tx, org, email, 'withdrawn');
      }),
  };
}
