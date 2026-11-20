import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  resolveCanonicalOrigin,
  type CanonicalOrigin,
  type RequestContext,
} from '@nennbox/core';
import {
  createPersonalLinkToken,
  hashPersonalLinkToken,
} from './personal-link-token.js';
import {
  driverPortalLinks,
  driverPortalSessions,
} from './schema/driver-portal.js';
import { registrationGroups, entries, people } from './schema/entries.js';
import { events } from './schema/organization.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import type { Database } from './database.js';
const LINK_TTL = 30 * 60_000;
const SESSION_TTL = 60 * 60_000;
export function createDriverPortalAccess(
  db: Database,
  canonicalOrigin: CanonicalOrigin,
) {
  const session = async (ctx: RequestContext, token: string) => {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
    const [row] = await db
      .select({
        groupId: driverPortalSessions.registrationGroupId,
        eventId: driverPortalSessions.eventId,
      })
      .from(driverPortalSessions)
      .where(
        and(
          eq(driverPortalSessions.organizationId, ctx.organizationId),
          eq(driverPortalSessions.tokenHash, hashPersonalLinkToken(token)),
          isNull(driverPortalSessions.revokedAt),
          sql`${driverPortalSessions.expiresAt} > now()`,
          sql`exists (select 1 from entry e join entry_workflow_revision r on r.organization_id=e.organization_id and r.id=e.workflow_revision_id where e.organization_id=${driverPortalSessions.organizationId} and e.event_id=${driverPortalSessions.eventId} and e.registration_group_id=${driverPortalSessions.registrationGroupId} and e.deleted_at is null and not exists (select 1 from jsonb_array_elements(r.workflow->'statuses') s where s->>'key'=e.acceptance_status and s->>'category'='withdrawn'))`,
        ),
      )
      .limit(1);
    return row ?? null;
  };
  const ownsEntry = async (
    ctx: RequestContext,
    token: string,
    entryId: string,
  ) => {
    const access = await session(ctx, token);
    if (!access) return null;
    const [entry] = await db
      .select({
        id: entries.id,
        eventId: entries.eventId,
        groupId: entries.registrationGroupId,
        status: entries.acceptanceStatus,
      })
      .from(entries)
      .where(
        and(
          eq(entries.organizationId, ctx.organizationId),
          eq(entries.eventId, access.eventId),
          eq(entries.registrationGroupId, access.groupId),
          eq(entries.id, entryId),
          isNull(entries.deletedAt),
        ),
      )
      .limit(1);
    return entry ?? null;
  };
  return {
    session,
    ownsEntry,
    async request(
      ctx: RequestContext,
      eventSlug: string,
      email: string,
      locale: 'de' | 'en',
    ) {
      const origin = await resolveCanonicalOrigin(canonicalOrigin, ctx);
      if (!origin) return;
      const targets = await db
        .select({
          groupId: registrationGroups.id,
          eventId: events.id,
          eventName: events.name,
          eventSlug: events.slug,
          firstName: people.firstName,
          contactEmail: registrationGroups.contactEmail,
        })
        .from(registrationGroups)
        .innerJoin(
          events,
          and(
            eq(events.organizationId, registrationGroups.organizationId),
            eq(events.id, registrationGroups.eventId),
          ),
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, registrationGroups.organizationId),
            eq(people.id, registrationGroups.personId),
          ),
        )
        .innerJoin(
          entries,
          and(
            eq(entries.organizationId, registrationGroups.organizationId),
            eq(entries.registrationGroupId, registrationGroups.id),
          ),
        )
        .where(
          and(
            eq(registrationGroups.organizationId, ctx.organizationId),
            eq(events.slug, eventSlug),
            sql`lower(trim(${registrationGroups.contactEmail})) = ${email.trim().toLowerCase()}`,
            eq(entries.verificationStatus, 'verified'),
            sql`not exists (select 1 from entry_workflow_revision r, jsonb_array_elements(r.workflow->'statuses') s where r.organization_id=${entries.organizationId} and r.id=${entries.workflowRevisionId} and s->>'key'=${entries.acceptanceStatus} and s->>'category'='withdrawn')`,
            isNull(entries.deletedAt),
          ),
        )
        .groupBy(registrationGroups.id, events.id, people.id)
        .limit(10);
      for (const target of targets)
        await db.transaction(async (tx) => {
          const now = new Date();
          const { token, tokenHash, expiresAt } = createPersonalLinkToken(
            LINK_TTL,
            now,
          );
          await tx
            .update(driverPortalLinks)
            .set({ revokedAt: now })
            .where(
              and(
                eq(driverPortalLinks.organizationId, ctx.organizationId),
                eq(driverPortalLinks.registrationGroupId, target.groupId),
                isNull(driverPortalLinks.consumedAt),
                isNull(driverPortalLinks.revokedAt),
              ),
            );
          const [link] = await tx
            .insert(driverPortalLinks)
            .values({
              organizationId: ctx.organizationId,
              eventId: target.eventId,
              registrationGroupId: target.groupId,
              tokenHash,
              expiresAt,
            })
            .returning({ id: driverPortalLinks.id });
          const linkUrl = new URL(
            `/events/${encodeURIComponent(target.eventSlug)}/my-entry#token=${encodeURIComponent(token)}`,
            origin,
          ).toString();
          await enqueueMailOutbox(
            db,
            ctx.organizationId,
            {
              eventId: target.eventId,
              registrationGroupId: target.groupId,
              templateKey: 'driver-portal-link',
              templateVersion: 1,
              locale,
              recipient: target.contactEmail!,
              idempotencyKey: `driver-portal-link:${link!.id}`,
              variables: {
                recipientName: target.firstName,
                eventName: target.eventName,
                linkUrl,
              },
            },
            tx,
          );
        });
    },
    async redeem(ctx: RequestContext, token: string) {
      if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
      return db.transaction(async (tx) => {
        const [link] = await tx
          .update(driverPortalLinks)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(driverPortalLinks.organizationId, ctx.organizationId),
              eq(driverPortalLinks.tokenHash, hashPersonalLinkToken(token)),
              isNull(driverPortalLinks.consumedAt),
              isNull(driverPortalLinks.revokedAt),
              sql`${driverPortalLinks.expiresAt} > now()`,
            ),
          )
          .returning({
            eventId: driverPortalLinks.eventId,
            groupId: driverPortalLinks.registrationGroupId,
          });
        if (!link) return null;
        const active = await tx.execute(
          sql`select 1 from entry e join entry_workflow_revision r on r.organization_id=e.organization_id and r.id=e.workflow_revision_id where e.organization_id=${ctx.organizationId} and e.event_id=${link.eventId} and e.registration_group_id=${link.groupId} and e.deleted_at is null and not exists (select 1 from jsonb_array_elements(r.workflow->'statuses') s where s->>'key'=e.acceptance_status and s->>'category'='withdrawn') limit 1`,
        );
        if (!(active as unknown as { rows: unknown[] }).rows.length)
          return null;
        const sessionToken = createPersonalLinkToken(SESSION_TTL);
        await tx.insert(driverPortalSessions).values({
          organizationId: ctx.organizationId,
          eventId: link.eventId,
          registrationGroupId: link.groupId,
          tokenHash: sessionToken.tokenHash,
          expiresAt: sessionToken.expiresAt,
        });
        return sessionToken.token;
      });
    },
  };
}
