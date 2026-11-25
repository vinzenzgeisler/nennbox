import { and, eq, isNull, ne } from 'drizzle-orm';
import { assertWorkflowTransition } from '@nennbox/core';
import { createEntryWorkflowRepository } from './entry-workflow.js';
import {
  entryAuditEvents,
  entryDataAuditEvents,
} from './schema/entry-audit.js';
import {
  driverPortalLinks,
  driverPortalSessions,
} from './schema/driver-portal.js';
import type { RequestContext } from '@nennbox/core';
import { eventDriverPortalFields } from './schema/driver-portal.js';
import { registrationGroups, entries } from './schema/entries.js';
import { events } from './schema/organization.js';
import type { Database } from './database.js';
import { guardRefundTransition } from './refund-transition.js';
import { openRefundIntent } from './payment-refund-intents.js';
import type { createDriverPortalAccess } from './driver-portal-access.js';
import type { DriverPortalField } from './driver-portal.js';
export function createDriverPortalMutations(
  db: Database,
  ownsEntry: ReturnType<typeof createDriverPortalAccess>['ownsEntry'],
) {
  return {
    async fields(ctx: RequestContext, eventId: string) {
      return (
        await db
          .select({ key: eventDriverPortalFields.fieldKey })
          .from(eventDriverPortalFields)
          .where(
            and(
              eq(eventDriverPortalFields.organizationId, ctx.organizationId),
              eq(eventDriverPortalFields.eventId, eventId),
            ),
          )
      ).map((row) => row.key);
    },
    async setFields(
      ctx: RequestContext,
      eventId: string,
      fields: DriverPortalField[],
    ) {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, ctx.organizationId),
            eq(events.id, eventId),
          ),
        )
        .limit(1);
      if (!event) return false;
      await db.transaction(async (tx) => {
        await tx
          .delete(eventDriverPortalFields)
          .where(
            and(
              eq(eventDriverPortalFields.organizationId, ctx.organizationId),
              eq(eventDriverPortalFields.eventId, eventId),
            ),
          );
        if (fields.length)
          await tx.insert(eventDriverPortalFields).values(
            fields.map((fieldKey) => ({
              organizationId: ctx.organizationId,
              eventId,
              fieldKey,
            })),
          );
      });
      return true;
    },
    async update(
      ctx: RequestContext,
      token: string,
      entryId: string,
      changes: Partial<Record<DriverPortalField, string>>,
    ) {
      const entry = await ownsEntry(ctx, token, entryId);
      if (!entry || entry.status === 'withdrawn') return false;
      const allowed = await db
        .select({ key: eventDriverPortalFields.fieldKey })
        .from(eventDriverPortalFields)
        .where(
          and(
            eq(eventDriverPortalFields.organizationId, ctx.organizationId),
            eq(eventDriverPortalFields.eventId, entry.eventId),
          ),
        );
      if (
        !Object.keys(changes).length ||
        Object.keys(changes).some(
          (key) => !allowed.some((field) => field.key === key),
        )
      )
        return false;
      await db.transaction(async (tx) => {
        const [group] = await tx
          .select()
          .from(registrationGroups)
          .where(
            and(
              eq(registrationGroups.organizationId, ctx.organizationId),
              eq(registrationGroups.id, entry.groupId),
            ),
          )
          .for('update')
          .limit(1);
        if (!group) return;
        const changeset: Record<
          string,
          { from: string | null; to: string | null }
        > = {};
        for (const [key, value] of Object.entries(changes) as Array<
          [DriverPortalField, string]
        >)
          if (group[key] !== value)
            changeset[key] = { from: group[key], to: value };
        if (!Object.keys(changeset).length) return;
        await tx
          .update(registrationGroups)
          .set(changes)
          .where(
            and(
              eq(registrationGroups.organizationId, ctx.organizationId),
              eq(registrationGroups.id, entry.groupId),
            ),
          );
        const affected = await tx
          .select({ id: entries.id })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.registrationGroupId, entry.groupId),
              isNull(entries.deletedAt),
            ),
          );
        for (const row of affected)
          await tx.insert(entryDataAuditEvents).values({
            organizationId: ctx.organizationId,
            entryId: row.id,
            subject: 'driver',
            changes: changeset,
            actor: 'driver-portal',
          });
      });
      return true;
    },
    async withdraw(ctx: RequestContext, token: string, entryId: string) {
      const entry = await ownsEntry(ctx, token, entryId);
      if (!entry || entry.status === 'withdrawn') return false;
      const pinned = await createEntryWorkflowRepository(db).getPinnedForEntry(
        ctx,
        entryId,
      );
      const target = pinned?.workflow.statuses.find(
        (status) => status.category === 'withdrawn',
      );
      if (!pinned || !target) return false;
      try {
        assertWorkflowTransition(
          pinned.workflow,
          entry.status,
          target.id ?? target.key,
          'Participant withdrew entry',
        );
      } catch {
        return false;
      }
      return db.transaction(async (tx) => {
        await guardRefundTransition(
          tx,
          ctx.organizationId,
          entryId,
          target.id ?? target.key,
          'withdrawn',
        );
        const now = new Date();
        const [updated] = await tx
          .update(entries)
          .set({ acceptanceStatus: target.id ?? target.key })
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.id, entryId),
              eq(entries.registrationGroupId, entry.groupId),
              eq(entries.acceptanceStatus, entry.status),
              isNull(entries.deletedAt),
            ),
          )
          .returning({ id: entries.id });
        if (!updated) return false;
        await tx.insert(entryAuditEvents).values({
          organizationId: ctx.organizationId,
          entryId,
          transition: 'acceptance',
          fromStatus: entry.status,
          toStatus: target.id ?? target.key,
          actor: 'driver-portal',
          reason: 'Participant withdrew entry',
          statusCategory: 'withdrawn',
          workflowRevisionId: pinned.id,
        });
        await openRefundIntent(tx, ctx.organizationId, entryId, 'withdrawn');
        const [active] = await tx
          .select({ id: entries.id })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.registrationGroupId, entry.groupId),
              ne(entries.acceptanceStatus, target.id ?? target.key),
              isNull(entries.deletedAt),
            ),
          )
          .limit(1);
        if (!active) {
          await tx
            .update(driverPortalSessions)
            .set({ revokedAt: now })
            .where(
              and(
                eq(driverPortalSessions.organizationId, ctx.organizationId),
                eq(driverPortalSessions.registrationGroupId, entry.groupId),
                isNull(driverPortalSessions.revokedAt),
              ),
            );
          await tx
            .update(driverPortalLinks)
            .set({ revokedAt: now })
            .where(
              and(
                eq(driverPortalLinks.organizationId, ctx.organizationId),
                eq(driverPortalLinks.registrationGroupId, entry.groupId),
                isNull(driverPortalLinks.revokedAt),
                isNull(driverPortalLinks.consumedAt),
              ),
            );
        }
        return true;
      });
    },
  };
}
