import { sql } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import { workbasketRuleIds, type WorkbasketTask } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createWorkbasketRepository } from './workbasket.js';
import { loadWorkbasketSnapshot } from './workbasket-snapshot.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

describe.skipIf(!url)('workbasket persisted office details', () => {
  it('projects concrete facts, bilingual copy and entry references for all 13 rules', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    try {
      const a = await seed('office-details');
      const repo = createWorkbasketRepository(db);
      const createdAt = '2020-01-02T10:30:00.123456Z';
      await db.execute(sql`
        UPDATE entry SET created_at=${createdAt}::timestamptz,
          assigned_start_number='42', orga_code=${'OFFICE-' + a.entry.id}
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${a.entry.id}
      `);
      await db.execute(sql`
        UPDATE event SET registration_closes_at='2020-01-31T22:30:00Z'
        WHERE organization_id=${a.org.id} AND id=${a.event.id}
      `);
      await db.execute(sql`
        UPDATE event_class SET min_displacement_cc=1000, max_displacement_cc=2000,
          min_year=1980, max_year=2000
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${a.klass.id}
      `);
      await db.execute(sql`
        UPDATE vehicle SET year=1975, vin='OFFICE-VIN', registration='OFF-42'
        WHERE organization_id=${a.org.id} AND id=${a.vehicle.id}
      `);
      await db.execute(sql`
        UPDATE person SET date_of_birth='2015-06-02', email='office@example.test'
        WHERE organization_id=${a.org.id} AND id=${a.person.id}
      `);
      await db.execute(sql`
        UPDATE registration_group SET license_valid_until='2029-05-31'
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${a.group.id}
      `);
      await db.execute(sql`
        INSERT INTO event_entry_document_type(organization_id,event_id,key,name,required,enabled)
        VALUES (${a.org.id},${a.event.id},'license','Sportlizenz',true,true),
          (${a.org.id},${a.event.id},'medical','Ärztliches Attest',true,true),
          (${a.org.id},${a.event.id},'disabled','Deaktiviert',true,false),
          (${a.org.id},${a.event.id},'optional','Optional',false,true)
      `);
      await db.execute(sql`
        INSERT INTO entry_document(organization_id,event_id,entry_id,type_key,object_id,
          file_name,content_type,size,sha256,uploaded_by,valid_until)
        VALUES(${a.org.id},${a.event.id},${a.entry.id},'license',${crypto.randomUUID()},
          'license.pdf','application/pdf',1,${'a'.repeat(64)},'test','2029-05-30')
      `);

      const snapshot = await loadWorkbasketSnapshot(db, a.ctx, a.event.id);
      expect(snapshot).toMatchObject({
        eventDate: '2030-06-01',
        closingDate: '2020-01-31',
        classes: [
          expect.objectContaining({
            name: 'Open',
            minYear: 1980,
            maxYear: 2000,
          }),
        ],
      });
      expect(snapshot.entries[0]).toMatchObject({
        id: a.entry.id,
        organizationCode: 'OFFICE-' + a.entry.id,
        startNumber: '42',
        createdAt,
        createdOn: '2020-01-02',
        missingDocumentNames: ['Ärztliches Attest'],
        expiringDocuments: [{ name: 'Sportlizenz', validUntil: '2029-05-30' }],
        documentsComplete: false,
        paid: false,
      });
      const ageDays =
        (Date.parse(snapshot.today) - Date.parse('2020-01-02')) / 86_400_000;
      const reference = {
        id: a.entry.id,
        name: 'Erika Test',
        startNumber: '42',
        organizationCode: 'OFFICE-' + a.entry.id,
        className: 'Open',
        createdAt,
      };
      const covered = new Set<string>();
      // Check the JSONB projection and a second repository read, not just the engine's output.
      const read = async () => {
        const result = (await repo.tasks(a.ctx, a.event.id))!;
        const persisted = await db.execute(sql`
          SELECT tasks FROM workbasket_cache
          WHERE organization_id=${a.org.id} AND event_id=${a.event.id}
        `);
        expect(persisted.rows[0]?.tasks).toEqual(result.tasks);
        const cached = (await repo.tasks(a.ctx, a.event.id))!;
        expect(cached.generation).toBe(result.generation);
        expect(cached.tasks).toEqual(result.tasks);
        for (const task of result.tasks) {
          expect(task.detail?.de).toBeTruthy();
          expect(task.detail?.en).toBeTruthy();
          expect(task.className).toBe('Open');
          if (task.entryId === a.entry.id) {
            expect(task.entry).toEqual(reference);
            expect(task.ageDays).toBe(ageDays);
          }
        }
        return result.tasks;
      };
      const task = (
        tasks: readonly WorkbasketTask[],
        ruleId: WorkbasketTask['ruleId'],
        entryId: string | null = a.entry.id,
      ) => {
        const found = tasks.find(
          (t) => t.ruleId === ruleId && t.entryId === entryId,
        );
        expect(found, ruleId).toBeDefined();
        covered.add(ruleId);
        return found!;
      };

      const warnings = await read();
      expect(task(warnings, 'missingDocuments')).toMatchObject({
        values: { days: ageDays, documents: ['Ärztliches Attest'] },
        detail: {
          de: `Ärztliches Attest fehlt seit ${ageDays} Tagen.`,
          en: `Ärztliches Attest missing for ${ageDays} days.`,
        },
      });
      expect(task(warnings, 'paymentOpen')).toMatchObject({
        values: { closingDate: '2020-01-31' },
        detail: {
          de: 'Zahlung offen; Nennschluss am 2020-01-31.',
          en: 'Payment outstanding; registration closes on 2020-01-31.',
        },
      });
      expect(task(warnings, 'displacement').values).toEqual({
        value: 2100,
        lower: 1000,
        upper: 2000,
      });
      expect(task(warnings, 'year').values).toEqual({
        value: 1975,
        lower: 1980,
        upper: 2000,
      });
      expect(task(warnings, 'expiredLicense').values).toEqual({
        validUntil: '2029-05-31',
        eventDate: '2030-06-01',
      });
      expect(task(warnings, 'expiredDocument')).toMatchObject({
        values: {
          dates: ['2029-05-30'],
          documents: ['Sportlizenz: 2029-05-30'],
          eventDate: '2030-06-01',
        },
        detail: {
          de: 'Abgelaufene Unterlagen: Sportlizenz: 2029-05-30; Veranstaltung am 2030-06-01.',
          en: 'Expired documents: Sportlizenz: 2029-05-30; event on 2030-06-01.',
        },
      });
      expect(task(warnings, 'minorGuardian').values).toEqual({
        age: 14,
        dateOfBirth: '2015-06-02',
        eventDate: '2030-06-01',
      });

      const otherId = crypto.randomUUID();
      const otherCode = 'OTHER-' + otherId;
      // Distinct persisted numbers remain unique in SQL but collide after NFKC normalization.
      await db.execute(sql`
        INSERT INTO entry(id,organization_id,event_id,class_id,registration_group_id,
          driver_person_id,vehicle_id,orga_code,requested_start_number,created_at)
        SELECT ${otherId},organization_id,event_id,class_id,registration_group_id,
          driver_person_id,vehicle_id,${otherCode},'４２',${createdAt}::timestamptz
        FROM entry WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${a.entry.id}
      `);
      const conflicts = await read();
      for (const [rule, fields] of [
        ['duplicateStartNumber', ['startNumber']],
        ['duplicatePerson', ['firstName', 'lastName', 'dateOfBirth', 'email']],
        ['duplicateVehicle', ['vehicleId', 'vin', 'registration']],
      ] as const) {
        expect(task(conflicts, rule).relatedEntries).toEqual([
          {
            ...reference,
            id: otherId,
            organizationCode: otherCode,
            startNumber: '４２',
            fields: [...fields],
          },
        ]);
        expect(task(conflicts, rule).detail?.de).toContain('#４２');
        expect(task(conflicts, rule).detail?.en).toContain('#４２');
        expect(task(conflicts, rule, otherId).relatedEntries).toEqual([
          { ...reference, fields: [...fields] },
        ]);
      }
      expect(task(conflicts, 'capacityNear', null)).toMatchObject({
        entry: null,
        ageDays: null,
        values: { occupied: 2, maximum: 2 },
        detail: {
          de: '2 von 2 Plätzen belegt.',
          en: '2 of 2 places occupied.',
        },
      });

      await db.execute(sql`
        UPDATE entry SET acceptance_status='withdrawn'
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${otherId}
      `);
      await db.execute(sql`
        UPDATE vehicle SET displacement_cc=1900, year=1990
        WHERE organization_id=${a.org.id} AND id=${a.vehicle.id}
      `);
      await db.execute(sql`
        UPDATE registration_group SET guardian_name='Elternteil', license_valid_until='2030-06-01'
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${a.group.id}
      `);
      await db.execute(sql`
        UPDATE entry_document SET valid_until='2030-06-01'
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND entry_id=${a.entry.id}
      `);
      await db.execute(sql`
        INSERT INTO entry_document(organization_id,event_id,entry_id,type_key,object_id,
          file_name,content_type,size,sha256,uploaded_by)
        VALUES(${a.org.id},${a.event.id},${a.entry.id},'medical',${crypto.randomUUID()},
          'medical.pdf','application/pdf',1,${'b'.repeat(64)},'test')
      `);
      await db.execute(sql`
        INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status)
        VALUES(${a.org.id},${a.event.id},${a.group.id},0,'EUR',${crypto.randomUUID()},'paid')
      `);
      const complete = await loadWorkbasketSnapshot(db, a.ctx, a.event.id);
      expect(
        complete.entries.find((entry) => entry.id === a.entry.id),
      ).toMatchObject({
        paid: true,
        documentsComplete: true,
        missingDocumentNames: [],
      });
      const ready = await read();
      expect(ready.map((t) => t.ruleId)).toEqual(['ready']);
      expect(task(ready, 'ready').detail).toEqual({
        de: 'Bezahlt, Unterlagen vollständig, keine aktiven Warnungen — bereit zum Zulassen.',
        en: 'Paid, documents complete, no active warnings — ready for admission.',
      });

      await db.execute(sql`
        UPDATE entry SET acceptance_status='waitlisted', waitlist_position=3,
          requested_start_number='43'
        WHERE organization_id=${a.org.id} AND event_id=${a.event.id} AND id=${otherId}
      `);
      const promotion = task(await read(), 'waitlistPromotion', otherId);
      expect(promotion).toMatchObject({
        entry: {
          ...reference,
          id: otherId,
          startNumber: '43',
          organizationCode: otherCode,
        },
        ageDays,
        values: { available: 1, position: 3 },
        detail: {
          de: '1 freie Klassenplätze; Wartelistenplatz 3 — Nachrücken prüfen.',
          en: '1 class places available; waitlist position 3 — review promotion.',
        },
      });
      expect([...covered].sort()).toEqual([...workbasketRuleIds].sort());
    } finally {
      await seed.cleanup();
      await pool.end();
    }
  });
});
