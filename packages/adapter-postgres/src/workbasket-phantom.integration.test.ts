import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { transitionEntry } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';
import { createDatabase } from './database-service.js';
import { createEntryRepository } from './entry-repository.js';
import { createEntryWorkflowRepository } from './entry-workflow.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('serializable admission phantom protection', () => {
  it('re-evaluates a newly required document after a real PostgreSQL serialization failure', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    const writer = await pool.connect();
    try {
      const a = await seed('phantom-admission');
      await pool.query('UPDATE vehicle SET displacement_cc=1900 WHERE id=$1', [
        a.vehicle.id,
      ]);
      await pool.query(
        "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
        [a.org.id, a.event.id, a.group.id, crypto.randomUUID()],
      );
      let transactions = 0;
      let injected = false;
      const errors: string[] = [];
      const dialect = new PgDialect();
      // Observe the production transaction without replacing its SQL or isolation.
      // Inject a committed phantom between its live snapshot read and mutation.
      const observedDb = new Proxy(db, {
        get(target, property) {
          if (property !== 'transaction') return Reflect.get(target, property);
          return async (
            work: (tx: TransactionDatabase) => Promise<unknown>,
            config: Parameters<Database['transaction']>[1],
          ) => {
            transactions++;
            try {
              return await target.transaction(async (tx) => {
                const observedTx = new Proxy(tx, {
                  get(transaction, key) {
                    if (key !== 'execute')
                      return Reflect.get(transaction, key, transaction);
                    return async (
                      ...args: Parameters<TransactionDatabase['execute']>
                    ) => {
                      const result = await transaction.execute(...args);
                      if (
                        !injected &&
                        dialect
                          .sqlToQuery(args[0] as import('drizzle-orm').SQL)
                          .sql.includes('FROM entry e')
                      ) {
                        injected = true;
                        await writer.query(
                          'BEGIN ISOLATION LEVEL SERIALIZABLE',
                        );
                        // Opposite dependency: this writer depends on the still-pending admission.
                        await writer.query(
                          'SELECT acceptance_status FROM entry WHERE id=$1',
                          [a.entry.id],
                        );
                        await writer.query(
                          "INSERT INTO event_entry_document_type(organization_id,event_id,key,name,required) VALUES($1,$2,'phantom','License',true)",
                          [a.org.id, a.event.id],
                        );
                        await writer.query('COMMIT');
                      }
                      return result;
                    };
                  },
                });
                return work(observedTx);
              }, config);
            } catch (error) {
              const cause = error as {
                code?: string;
                cause?: { code?: string };
              };
              if (cause.code || cause.cause?.code)
                errors.push(cause.code ?? cause.cause!.code!);
              throw error;
            }
          };
        },
      });
      await expect(
        transitionEntry(
          { ...a.ctx, permissions: new Set(['entry:write']) },
          a.entry.id,
          'acceptance',
          'accepted',
          'test',
          'checked',
          {
            entries: createEntryRepository(observedDb),
            workflows: createEntryWorkflowRepository(db),
          },
          { eventId: a.event.id },
        ),
      ).rejects.toThrow('Nicht mehr bereit');
      expect(injected).toBe(true);
      expect(errors).toContain('40001');
      expect(transactions).toBe(2);
      expect(
        (
          await pool.query('SELECT acceptance_status FROM entry WHERE id=$1', [
            a.entry.id,
          ])
        ).rows[0].acceptance_status,
      ).toBe('pending');
      expect(
        (
          await pool.query(
            'SELECT id FROM entry_audit_event WHERE entry_id=$1',
            [a.entry.id],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
      await seed.cleanup();
      await pool.end();
    }
  });
});
