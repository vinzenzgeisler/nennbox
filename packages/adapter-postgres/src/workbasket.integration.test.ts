import { sql } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import { createDatabase } from './database-service.js';
import { createWorkbasketRepository } from './workbasket.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)(
  'workbasket PostgreSQL invalidation and isolation',
  () => {
    it('caches unchanged reads; recomputes only affected events; isolates reads, writes and shared identities', async () => {
      const { db, pool } = await createDatabase(url!);
      const suffix = crypto.randomUUID();
      const seed = workbasketSeed(db);
      try {
        const a = await seed('basket-a'),
          b = await seed('basket-b');
        const repo = createWorkbasketRepository(db);
        const first = await repo.tasks(a.ctx, a.event.id);
        expect(first?.tasks).toContainEqual(
          expect.objectContaining({
            ruleId: 'displacement',
            entryId: a.entry.id,
            severity: 'warning',
          }),
        );
        expect((await repo.tasks(a.ctx, a.event.id))?.generation).toBe(
          first?.generation,
        );
        const second = await repo.tasks(b.ctx, b.event.id);
        expect(await repo.tasks(a.ctx, b.event.id)).toBeNull();
        expect(await repo.warnings(a.ctx, b.event.id, b.entry.id)).toBeNull();
        expect(await repo.configure(a.ctx, b.event.id, {})).toBeNull();
        expect(await repo.getConfiguration(a.ctx, b.event.id)).toBeNull();
        await expect(
          repo.configure(a.ctx, a.event.id, { unknown: { enabled: true } }),
        ).rejects.toThrow();
        await repo.configure(a.ctx, null, {
          missingDocuments: { days: 12 },
          displacement: { enabled: false },
        });
        await repo.configure(a.ctx, a.event.id, {
          missingDocuments: { days: 3 },
        });
        const config = await repo.getConfiguration(a.ctx, a.event.id);
        expect(config?.effective.missingDocuments).toEqual({
          enabled: true,
          days: 3,
        });
        expect(config?.effective.displacement.enabled).toBe(false);
        const configured = await repo.tasks(a.ctx, a.event.id);
        expect(configured?.generation).toBe(first!.generation + 1);
        expect(configured?.tasks.some((t) => t.ruleId === 'displacement')).toBe(
          false,
        );
        expect((await repo.tasks(b.ctx, b.event.id))?.generation).toBe(
          second?.generation,
        );
        // Direct SQL updates prove invalidation is not dependent on one application write path.
        await db.execute(
          sql`UPDATE vehicle SET displacement_cc=1900 WHERE organization_id=${a.org.id} AND id=${a.vehicle.id}`,
        );
        const edited = await repo.tasks(a.ctx, a.event.id);
        expect(edited?.generation).toBe(configured!.generation + 1);
        expect((await repo.tasks(a.ctx, a.event.id))?.generation).toBe(
          edited?.generation,
        );
        await db.execute(
          sql`UPDATE person SET date_of_birth='2020-06-02' WHERE organization_id=${a.org.id} AND id=${a.person.id}`,
        );
        const minor = await repo.warnings(a.ctx, a.event.id, a.entry.id);
        expect(minor).toContainEqual(
          expect.objectContaining({
            ruleId: 'minorGuardian',
            fields: expect.arrayContaining(['dateOfBirth']),
          }),
        );
        await db.execute(
          sql`UPDATE registration_group SET guardian_name='Elternteil' WHERE organization_id=${a.org.id} AND id=${a.group.id}`,
        );
        expect(
          (await repo.warnings(a.ctx, a.event.id, a.entry.id))?.some(
            (t) => t.ruleId === 'minorGuardian',
          ),
        ).toBe(false);
        const assertInvalidated = async (write: () => Promise<unknown>) => {
          const prior = (await repo.tasks(a.ctx, a.event.id))!;
          await write();
          const updated = (await repo.tasks(a.ctx, a.event.id))!;
          expect(updated.generation).toBe(prior.generation + 1);
          expect((await repo.tasks(b.ctx, b.event.id))?.generation).toBe(
            second?.generation,
          );
          return updated;
        };
        const paid = await assertInvalidated(() =>
          db.execute(sql`
          INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status)
          VALUES(${a.org.id},${a.event.id},${a.group.id},0,'EUR',${suffix},'paid')`),
        );
        expect(paid.tasks.some((t) => t.ruleId === 'ready')).toBe(true);
        const required = await assertInvalidated(() =>
          db.execute(sql`
          INSERT INTO event_entry_document_type(organization_id,event_id,key,name,required)
          VALUES(${a.org.id},${a.event.id},'license','Lizenz',true)`),
        );
        expect(required.tasks.some((t) => t.ruleId === 'ready')).toBe(false);
        const expired = await assertInvalidated(() =>
          db.execute(sql`
          INSERT INTO entry_document(organization_id,event_id,entry_id,type_key,object_id,file_name,content_type,size,sha256,uploaded_by,valid_until)
          VALUES(${a.org.id},${a.event.id},${a.entry.id},'license',${crypto.randomUUID()},'license.pdf','application/pdf',1,${'a'.repeat(64)},'test','2030-05-31')`),
        );
        expect(expired.tasks.some((t) => t.ruleId === 'expiredDocument')).toBe(
          true,
        );
        const valid = await assertInvalidated(() =>
          db.execute(sql`
          UPDATE entry_document SET valid_until='2030-06-01'
          WHERE organization_id=${a.org.id} AND entry_id=${a.entry.id}`),
        );
        expect(valid.tasks.some((t) => t.ruleId === 'expiredDocument')).toBe(
          false,
        );
        expect(valid.tasks.some((t) => t.ruleId === 'ready')).toBe(true);
        await assertInvalidated(() =>
          db.execute(sql`
          UPDATE event_class SET max_participants=1 WHERE organization_id=${a.org.id} AND id=${a.klass.id}`),
        );
        expect(
          (await repo.tasks(a.ctx, a.event.id))?.tasks.some(
            (t) => t.ruleId === 'capacityNear',
          ),
        ).toBe(true);
        const before = (await repo.tasks(a.ctx, a.event.id))!;
        await db.execute(
          sql`UPDATE workbasket_cache SET valid_until=now()-interval '1 second' WHERE organization_id=${a.org.id} AND event_id=${a.event.id}`,
        );
        const parallel = await Promise.all([
          repo.tasks(a.ctx, a.event.id),
          repo.tasks(a.ctx, a.event.id),
        ]);
        expect(parallel.map((r) => r?.generation)).toEqual([
          before.generation + 1,
          before.generation + 1,
        ]);
        expect((await repo.tasks(b.ctx, b.event.id))?.generation).toBe(
          second?.generation,
        );
        for (const task of before.tasks) {
          expect(task.reason.length).toBeGreaterThan(5);
          expect(task.fields.length).toBeGreaterThan(0);
        }
      } finally {
        await seed.cleanup();
        await pool.end();
      }
    });
  },
);
