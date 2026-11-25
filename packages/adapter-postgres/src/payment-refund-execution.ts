import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestContext } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { invoices } from './schema/billing.js';
import {
  paymentRefundIntents,
  paymentRefundReservations,
} from './schema/provider-payments.js';
import { countActiveEntries } from './entry-group-activity.js';

// Claims have a bounded, separate pool: holding every application connection
// during provider I/O would starve the booking/error queries that release them.
const claimPools = new WeakMap<Database, Pool>();
function claimDatabase(db: Database): Database {
  let pool = claimPools.get(db);
  if (!pool) {
    const applicationPool = (db as Database & { $client: Pool }).$client;
    pool = new Pool({
      ...applicationPool.options,
      max: 4,
      idleTimeoutMillis: 1000,
      allowExitOnIdle: true,
      application_name: 'nennbox-refund-claim',
    });
    // A lost checked-out claim connection must leave durable ownership behind,
    // not crash the process through an unhandled client error. Queries still fail.
    pool.on('connect', (client) => client.on('error', () => {}));
    claimPools.set(db, pool);
  }
  return drizzle(pool);
}

/** The advisory lock IS the execution claim. Connection loss releases it; a
 * slow provider never loses its claim to a timeout. All executors and office
 * abandonment use this same tenant/key namespace before taking invoice locks.
 * A collision only serializes unrelated work, never permits concurrent work.
 */
export async function claimRefundExecution(
  tx: TransactionDatabase,
  org: string,
  key: string,
): Promise<boolean> {
  const result = await tx.execute(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${'refund-execution:' + org + ':' + key}, 0)) as claimed`,
  );
  return (result as unknown as { rows: { claimed: boolean }[] }).rows[0]!
    .claimed;
}

export async function withRefundExecution<T>(
  db: Database,
  ctx: RequestContext,
  key: string,
  run: () => Promise<T>,
): Promise<T | null> {
  return claimDatabase(db).transaction(async (claim) => {
    if (!(await claimRefundExecution(claim, ctx.organizationId, key)))
      return null;
    // Do not hold the invoice lock across network I/O: other operations may
    // legitimately reserve the remainder while this refund is executing.
    const token = randomUUID();
    const executable = await db.transaction(async (tx) => {
      const [operation] = await tx
        .select()
        .from(paymentRefundReservations)
        .where(
          and(
            eq(paymentRefundReservations.organizationId, ctx.organizationId),
            eq(paymentRefundReservations.idempotencyKey, key),
          ),
        );
      if (!operation) return false;
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.id, operation.invoiceId),
          ),
        )
        .for('update');
      if (!invoice) return false;
      if (operation.source === 'automatic') {
        const [intent] = await tx
          .select()
          .from(paymentRefundIntents)
          .where(
            and(
              eq(paymentRefundIntents.organizationId, ctx.organizationId),
              eq(paymentRefundIntents.id, operation.intentId!),
            ),
          );
        if (
          intent?.status !== 'processing' ||
          (await countActiveEntries(
            tx,
            ctx.organizationId,
            invoice.registrationGroupId,
          )) > 0
        )
          return false;
      }
      // Compare-and-set current state, never the earlier batch/reserve snapshot.
      const updated = await tx
        .update(paymentRefundReservations)
        .set({
          updatedAt: new Date(),
          executionToken: token,
          // A previous owner lost its connection/process. Retry only the same
          // provider key; ambiguous outcomes must never make this abandonable.
          executionUncertain: sql`${paymentRefundReservations.executionUncertain} or ${paymentRefundReservations.executionToken} is not null`,
        })
        .where(
          and(
            eq(paymentRefundReservations.organizationId, ctx.organizationId),
            eq(paymentRefundReservations.id, operation.id),
            eq(paymentRefundReservations.status, 'reserved'),
            isNull(paymentRefundReservations.needsReviewAt),
          ),
        )
        .returning({ id: paymentRefundReservations.id });
      return updated.length === 1;
    });
    if (!executable) return null;
    try {
      return await run();
    } finally {
      // Only a live claim, after its provider/booking/error handling finished,
      // may clear its own ownership. Connection loss leaves a durable fence.
      await claim.execute(sql`select 1`);
      await db
        .update(paymentRefundReservations)
        .set({ executionToken: null })
        .where(
          and(
            eq(paymentRefundReservations.organizationId, ctx.organizationId),
            eq(paymentRefundReservations.idempotencyKey, key),
            eq(paymentRefundReservations.executionToken, token),
            eq(paymentRefundReservations.executionUncertain, false),
          ),
        );
    }
  });
}
