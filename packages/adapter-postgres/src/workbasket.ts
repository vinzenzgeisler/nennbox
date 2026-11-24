import { sql } from 'drizzle-orm';
import {
  workbasketRuleIds,
  evaluateWorkbasket,
  resolveWorkbasketConfig,
  validateWorkbasketConfig,
  type RequestContext,
  type WorkbasketConfig,
  type WorkbasketTask,
  type WorkbasketRepository,
} from '@nennbox/core';
import type { Database } from './database.js';
import { loadWorkbasketSnapshot } from './workbasket-snapshot.js';

export function createWorkbasketRepository(db: Database): WorkbasketRepository {
  const configuration = async (
    tx: Database,
    ctx: RequestContext,
    eventId: string | null,
  ) => {
    const rows = (
      await tx.execute(sql`
      SELECT event_id,config FROM workbasket_configuration
      WHERE organization_id=${ctx.organizationId}
      AND (event_id IS NULL OR event_id=${eventId})
    `)
    ).rows;
    const organization = rows.find((r) => r.event_id === null)?.config ?? {};
    const event =
      rows.find((r) => r.event_id === eventId && eventId !== null)?.config ??
      {};
    return {
      organization,
      event,
      effective: resolveWorkbasketConfig(
        validateWorkbasketConfig(organization),
        validateWorkbasketConfig(event),
      ),
    };
  };
  return {
    async getConfiguration(ctx: RequestContext, eventId: string | null) {
      if (
        eventId &&
        !(
          await db.execute(
            sql`SELECT 1 FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId}`,
          )
        ).rowCount
      )
        return null;
      return configuration(db, ctx, eventId);
    },
    async configure(
      ctx: RequestContext,
      eventId: string | null,
      input: unknown,
    ) {
      const config = validateWorkbasketConfig(input);
      return db.transaction(async (tx) => {
        if (
          eventId &&
          !(
            await tx.execute(
              sql`SELECT 1 FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId}`,
            )
          ).rowCount
        )
          return null;
        await tx.execute(sql`
          INSERT INTO workbasket_configuration(organization_id,scope_id,event_id,config)
          VALUES(${ctx.organizationId},${eventId ?? ctx.organizationId},${eventId},${JSON.stringify(config)}::jsonb)
          ON CONFLICT(organization_id,scope_id) DO UPDATE SET config=excluded.config
        `);
        return configuration(tx as unknown as Database, ctx, eventId);
      });
    },
    async tasks(ctx: RequestContext, eventId: string) {
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        if (
          !(
            await tx.execute(
              sql`SELECT 1 FROM event WHERE organization_id=${ctx.organizationId} AND id=${eventId}`,
            )
          ).rowCount
        )
          return null;
        await tx.execute(sql`
          INSERT INTO workbasket_cache(organization_id,event_id) VALUES(${ctx.organizationId},${eventId})
          ON CONFLICT DO NOTHING
        `);
        const cache = (
          await tx.execute(sql`
          SELECT *, (valid_until > now()) AS fresh FROM workbasket_cache
          WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} FOR UPDATE
        `)
        ).rows[0]!;
        let tasks = cache.tasks as WorkbasketTask[];
        let generation = Number(cache.generation);
        if (cache.dirty || !cache.fresh) {
          const snapshot = await loadWorkbasketSnapshot(tx, ctx, eventId);
          const config = (await configuration(tx, ctx, eventId))
            .effective as WorkbasketConfig;
          tasks = evaluateWorkbasket(snapshot, config);
          generation++;
          await tx.execute(sql`
            UPDATE workbasket_cache SET tasks=${JSON.stringify(tasks)}::jsonb,
              dirty=false,computed_at=now(),generation=generation+1,
              valid_until=least(
                (SELECT ((now() AT TIME ZONE timezone)::date+1)::timestamp AT TIME ZONE timezone
                 FROM organization WHERE id=${ctx.organizationId}),
                (SELECT min(waitlist_confirmation_deadline) FROM entry WHERE organization_id=${ctx.organizationId}
                 AND event_id=${eventId} AND waitlist_confirmation_deadline>now() AND deleted_at IS NULL))
            WHERE organization_id=${ctx.organizationId} AND event_id=${eventId}
          `);
        }
        const counts: Record<string, number> = Object.fromEntries(
          workbasketRuleIds.map((id) => [id, 0]),
        );
        for (const task of tasks)
          counts[task.ruleId] = (counts[task.ruleId] ?? 0) + 1;
        return { tasks, counts, generation };
      });
    },
    async warnings(ctx: RequestContext, eventId: string, entryId: string) {
      if (
        !(
          await db.execute(
            sql`SELECT 1 FROM entry WHERE organization_id=${ctx.organizationId} AND event_id=${eventId} AND id=${entryId} AND deleted_at IS NULL`,
          )
        ).rowCount
      )
        return null;
      const result = await this.tasks(ctx, eventId);
      return (
        result?.tasks.filter(
          (task) => task.entryId === entryId && task.severity === 'warning',
        ) ?? []
      );
    },
  };
}
