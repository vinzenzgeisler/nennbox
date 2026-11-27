import { describe, expect, it } from 'vitest';
import { createDatabase } from './database-service.js';
import { createEntryTransitionMethod } from './entry-transition-method.js';
import { seedPaths } from './entry-status-path-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

// Refund guard and intent invalidation through the real transition method, with
// non-standard keys. The money invariant itself is covered by
// refund-review-regressions.integration.test.ts, which stays unchanged.
async function withInvoice(
  run: (
    s: Awaited<ReturnType<typeof seedPaths>>,
    transition: (id: string, from: string, to: string) => Promise<unknown>,
    invoiceId: string,
    pool: Awaited<ReturnType<typeof createDatabase>>['pool'],
  ) => Promise<void>,
) {
  const { db, pool } = await createDatabase(url!);
  const s = await seedPaths(db, pool, 'refund-paths', { max: null });
  const invoiceId = (
    await pool.query(
      "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference) VALUES($1,$2,$3,4200,'EUR',$4) RETURNING id",
      [s.org.id, s.event.id, s.group.id, `PAY-${crypto.randomUUID()}`],
    )
  ).rows[0].id as string;
  const method = createEntryTransitionMethod(db);
  try {
    await run(
      s,
      (id, from, to) =>
        method.transition(s.ctx, id, 'acceptance', from, to, 'office', 'test'),
      invoiceId,
      pool,
    );
  } finally {
    await s.cleanup();
    await pool.end();
  }
}

const reserve = (
  pool: Awaited<ReturnType<typeof createDatabase>>['pool'],
  s: { org: { id: string } },
  invoiceId: string,
  needsReview = false,
) =>
  pool.query(
    `INSERT INTO payment_refund_reservation(organization_id,invoice_id,provider_payment_id,idempotency_key,source,amount_cents,status,needs_review_at)
     VALUES($1,$2,'pi-test',$3,'automatic',4200,'reserved',$4)`,
    [s.org.id, invoiceId, crypto.randomUUID(), needsReview ? new Date() : null],
  );

describe.skipIf(!url)('refund guard follows the pinned target category', () => {
  it('blocks reactivation, even into a status keyed "withdrawn", while a refund runs', () =>
    withInvoice(async (s, transition, invoiceId, pool) => {
      const entry = await s.addEntry('gone-r');
      await reserve(pool, s, invoiceId);
      await expect(transition(entry, 'gone-r', 'ok-1')).rejects.toMatchObject({
        message: 'refund_in_progress',
      });
      // The key says "withdrawn", the category says accepted: this is a reactivation.
      await expect(
        transition(entry, 'gone-r', 'withdrawn'),
      ).rejects.toMatchObject({ message: 'refund_in_progress' });
      expect((await s.row(entry)).status).toBe('gone-r');
    }));

  it('reports a refund that needs review separately', () =>
    withInvoice(async (s, transition, invoiceId, pool) => {
      const entry = await s.addEntry('gone-w');
      await reserve(pool, s, invoiceId, true);
      await expect(transition(entry, 'gone-w', 'ok-1')).rejects.toMatchObject({
        message: 'refund_needs_review',
      });
    }));

  it.each(['gone-w2', 'gone-r'])(
    'still allows a cancellation into %s while a refund runs',
    (target) =>
      withInvoice(async (s, transition, invoiceId, pool) => {
        const entry = await s.addEntry('ok-1');
        await reserve(pool, s, invoiceId);
        await expect(transition(entry, 'ok-1', target)).resolves.toBeTruthy();
        expect((await s.row(entry)).status).toBe(target);
      }),
  );

  it('voids waiting refund intents when the group is active again, judged by category', () =>
    withInvoice(async (s, transition, invoiceId, pool) => {
      const entry = await s.addEntry('gone-r');
      await pool.query(
        "INSERT INTO payment_refund_intent(organization_id,invoice_id,entry_id,trigger,status) VALUES($1,$2,$3,'rejected','pending')",
        [s.org.id, invoiceId, entry],
      );
      // "rejected" is only a key here; its category is accepted, so the group is active.
      await transition(entry, 'gone-r', 'rejected');
      const intent = (
        await pool.query(
          'SELECT status,failure FROM payment_refund_intent WHERE entry_id=$1',
          [entry],
        )
      ).rows[0];
      expect(intent).toEqual({
        status: 'skipped',
        failure: 'registration_reactivated',
      });
    }));
});
