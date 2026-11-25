import { beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from 'graphile-worker';
import { createDatabase, migrate } from './database-service.js';
import { workbasketSeed } from './workbasket-test-fixture.js';
import { createMessageRepository } from './messaging-repository.js';
import { createWorkbasketRepository } from './workbasket.js';
import { messageCampaignDelivery } from '@nennbox/core';
import type { MessageCampaignCreate } from '@nennbox/core';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('transactional workbasket campaign confirmation', () => {
  beforeAll(async () => {
    await migrate(url!);
    await runMigrations({ connectionString: url! });
  });
  it.each(['split', 'replace', 'paid', 'withdrawn', 'disabled'] as const)(
    'rejects %s drift after preview without a campaign or outbox row',
    async (change) => {
      const { db, pool } = await createDatabase(url!);
      const seed = workbasketSeed(db);
      try {
        const a = await seed('confirmed');
        await pool.query(
          'UPDATE event SET registration_closes_at=now() WHERE id=$1',
          [a.event.id],
        );
        await pool.query(
          "UPDATE registration_group SET contact_email='one@example.test' WHERE id=$1",
          [a.group.id],
        );
        const [second] = (
          await pool.query(
            "INSERT INTO registration_group(organization_id,event_id,person_id,contact_email) VALUES($1,$2,$3,'one@example.test') RETURNING id",
            [a.org.id, a.event.id, a.person.id],
          )
        ).rows;
        const [entry] = (
          await pool.query(
            'INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [
              a.org.id,
              a.event.id,
              a.klass.id,
              second.id,
              a.person.id,
              a.vehicle.id,
              crypto.randomUUID(),
            ],
          )
        ).rows;
        const entryIds = [a.entry.id, entry.id];
        const repo = createMessageRepository(db);
        const filter = {
          classIds: [],
          statuses: [],
          entryIds,
          additionalAddresses: [],
          payment: 'any' as const,
        };
        const tasks = await createWorkbasketRepository(db).tasks(
          a.ctx,
          a.event.id,
        );
        for (const id of entryIds)
          expect(tasks!.tasks).toContainEqual(
            expect.objectContaining({ entryId: id, ruleId: 'paymentOpen' }),
          );
        const previewResult = (await repo.preview(a.ctx, a.event.id, filter))!;
        expect(previewResult.ok).toBe(true);
        if (!previewResult.ok) throw new Error(previewResult.error.message);
        const preview = previewResult.value;
        expect(preview.count).toBe(1);
        const input: MessageCampaignCreate = {
          eventId: a.event.id,
          recipients: filter,
          subject: 'Payment',
          text: 'Reminder',
          attachments: [],
          workbasketConfirmation: {
            ruleId: 'paymentOpen',
            recipients: preview.recipients.map(({ entryId, email }) => ({
              entryId,
              email,
            })),
          },
        };
        if (change === 'split' || change === 'replace') {
          await pool.query(
            'UPDATE registration_group SET contact_email=$1 WHERE organization_id=$2 AND ($3 OR id=$4)',
            ['two@example.test', a.org.id, change === 'replace', second.id],
          );
        } else if (change === 'paid') {
          await pool.query(
            "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
            [a.org.id, a.event.id, second.id, crypto.randomUUID()],
          );
        } else if (change === 'withdrawn') {
          await pool.query(
            "UPDATE entry SET acceptance_status='withdrawn' WHERE id=$1",
            [entry.id],
          );
        } else {
          await createWorkbasketRepository(db).configure(a.ctx, a.event.id, {
            paymentOpen: { enabled: false },
          });
        }
        const result = await repo.send(
          a.ctx,
          a.event.id,
          crypto.randomUUID(),
          input,
          'test',
        );
        expect(result).toMatchObject({
          ok: false,
          error: { code: 'confirmation-changed' },
        });
        expect(
          (
            await pool.query(
              'SELECT id FROM message_campaign WHERE organization_id=$1',
              [a.org.id],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await pool.query(
              'SELECT id FROM email_outbox WHERE organization_id=$1',
              [a.org.id],
            )
          ).rowCount,
        ).toBe(0);
      } finally {
        await seed.cleanup();
        await pool.end();
      }
    },
  );
  it('excludes concurrent address/payment writers until enqueue commits, then replays even after eligibility changes', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    const writer = await pool.connect();
    let orgId: string | undefined;
    try {
      const a = await seed('concurrent-confirmation');
      orgId = a.org.id;
      await pool.query(
        'UPDATE event SET registration_closes_at=now() WHERE id=$1',
        [a.event.id],
      );
      await pool.query(
        "UPDATE registration_group SET contact_email='one@example.test' WHERE id=$1",
        [a.group.id],
      );
      const repo = createMessageRepository(db);
      const input: MessageCampaignCreate = {
        eventId: a.event.id,
        recipients: {
          classIds: [],
          statuses: [],
          payment: 'any',
          entryIds: [a.entry.id],
          additionalAddresses: [],
        },
        subject: 'Reminder',
        text: 'Body',
        attachments: [],
        workbasketConfirmation: {
          ruleId: 'paymentOpen',
          recipients: [{ entryId: a.entry.id, email: 'one@example.test' }],
        },
      };
      await writer.query("SET lock_timeout='100ms'");
      const strategy = messageCampaignDelivery<
        typeof import('./messaging-schema.js').messageCampaigns.$inferSelect,
        typeof import('./messaging-schema.js').messageCampaignRecipients.$inferSelect
      >();
      const key = crypto.randomUUID();
      const first = await repo.send(a.ctx, a.event.id, key, input, 'test', {
        ...strategy,
        enqueue: async (tx, value) => {
          await expect(
            writer.query(
              "UPDATE registration_group SET contact_email='changed@example.test' WHERE id=$1",
              [a.group.id],
            ),
          ).rejects.toMatchObject({ code: '55P03' });
          await expect(
            writer.query(
              "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
              [a.org.id, a.event.id, a.group.id, crypto.randomUUID()],
            ),
          ).rejects.toMatchObject({ code: '55P03' });
          return strategy.enqueue(tx, value);
        },
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.error.message);
      expect(first.campaign.recipients.map((r) => r.email)).toEqual([
        'one@example.test',
      ]);
      await writer.query(
        "UPDATE entry SET acceptance_status='withdrawn' WHERE id=$1",
        [a.entry.id],
      );
      await writer.query(
        "UPDATE registration_group SET contact_email='changed@example.test' WHERE id=$1",
        [a.group.id],
      );
      const replay = await repo.send(a.ctx, a.event.id, key, input, 'test');
      expect(replay).toMatchObject({
        ok: true,
        replayed: true,
        campaign: { campaign: { id: first.campaign.campaign.id } },
      });
      expect(
        (
          await pool.query(
            'SELECT id FROM email_outbox WHERE organization_id=$1',
            [a.org.id],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await writer.query('RESET lock_timeout');
      writer.release();
      if (orgId) {
        await pool.query(
          'DELETE FROM message_campaign WHERE organization_id=$1',
          [orgId],
        );
        await pool.query('DELETE FROM email_outbox WHERE organization_id=$1', [
          orgId,
        ]);
      }
      await seed.cleanup();
      await pool.end();
    }
  });
  it('uses the current missing-document rule, rejecting a completed document after preview', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    try {
      const a = await seed('document-confirmation');
      await pool.query(
        "UPDATE registration_group SET contact_email='one@example.test' WHERE id=$1",
        [a.group.id],
      );
      await pool.query(
        "UPDATE entry SET created_at=now()-interval '10 days' WHERE id=$1",
        [a.entry.id],
      );
      await pool.query(
        "INSERT INTO event_entry_document_type(organization_id,event_id,key,name,required) VALUES($1,$2,'license','License',true)",
        [a.org.id, a.event.id],
      );
      expect(
        (await createWorkbasketRepository(db).tasks(a.ctx, a.event.id))!.tasks,
      ).toContainEqual(
        expect.objectContaining({
          ruleId: 'missingDocuments',
          entryId: a.entry.id,
        }),
      );
      const input: MessageCampaignCreate = {
        eventId: a.event.id,
        recipients: {
          classIds: [],
          statuses: [],
          payment: 'any',
          entryIds: [a.entry.id],
          additionalAddresses: [],
        },
        subject: 'Documents',
        text: 'Reminder',
        attachments: [],
        workbasketConfirmation: {
          ruleId: 'missingDocuments',
          recipients: [{ entryId: a.entry.id, email: 'one@example.test' }],
        },
      };
      await pool.query(
        "INSERT INTO entry_document(organization_id,event_id,entry_id,type_key,object_id,file_name,content_type,size,sha256,uploaded_by) VALUES($1,$2,$3,'license',$4,'license.pdf','application/pdf',1,repeat('a',64),'test')",
        [a.org.id, a.event.id, a.entry.id, crypto.randomUUID()],
      );
      expect(
        await createMessageRepository(db).send(
          a.ctx,
          a.event.id,
          crypto.randomUUID(),
          input,
          'test',
        ),
      ).toMatchObject({ ok: false, error: { code: 'confirmation-changed' } });
      expect(
        (
          await pool.query(
            'SELECT id FROM email_outbox WHERE organization_id=$1',
            [a.org.id],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await seed.cleanup();
      await pool.end();
    }
  });
});
