import { beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from 'graphile-worker';
import {
  messageCampaignDelivery,
  type MessageCampaignCreate,
} from '@nennbox/core';
import { createDatabase, migrate } from './database-service.js';
import { createMessageRepository } from './messaging-repository.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('serializable reminder retries', () => {
  beforeAll(async () => {
    await migrate(url!);
    await runMigrations({ connectionString: url! });
  });
  it('rolls back tentative outbox/jobs and reuses the immutable key on retry and replay', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    let orgId: string | undefined;
    try {
      const a = await seed('retry-reminder');
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
      const strategy = messageCampaignDelivery<
        typeof import('./messaging-schema.js').messageCampaigns.$inferSelect,
        typeof import('./messaging-schema.js').messageCampaignRecipients.$inferSelect
      >();
      const attemptedCampaigns: string[] = [];
      const attemptedOutbox: string[] = [];
      const key = crypto.randomUUID();
      const result = await repo.send(a.ctx, a.event.id, key, input, 'test', {
        ...strategy,
        enqueue: async (tx, value) => {
          attemptedCampaigns.push(value.campaign.id);
          const enqueued = await strategy.enqueue(tx, value);
          if (enqueued.ok) attemptedOutbox.push(enqueued.recipient.outboxId!);
          if (attemptedCampaigns.length === 1)
            throw new Error('commit serialization failure', {
              cause: { code: '40001' },
            });
          return enqueued;
        },
      });
      expect(result.ok).toBe(true);
      expect(attemptedCampaigns).toHaveLength(2);
      expect(new Set(attemptedCampaigns).size).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT id FROM message_campaign WHERE organization_id=$1',
            [orgId],
          )
        ).rows,
      ).toEqual([{ id: attemptedCampaigns[1] }]);
      expect(
        (
          await pool.query(
            'SELECT id FROM email_outbox WHERE organization_id=$1',
            [orgId],
          )
        ).rows,
      ).toEqual([{ id: attemptedOutbox[1] }]);
      // The aborted outbox's worker job must not survive rollback either.
      expect(
        (
          await pool.query(
            "SELECT id FROM graphile_worker._private_jobs WHERE payload->'payload'->>'outboxId'=$1",
            [attemptedOutbox[0]],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT id FROM graphile_worker._private_jobs WHERE payload->'payload'->>'outboxId'=$1",
            [attemptedOutbox[1]],
          )
        ).rowCount,
      ).toBe(1);
      await pool.query(
        "UPDATE registration_group SET contact_email='changed@example.test' WHERE id=$1",
        [a.group.id],
      );
      const replay = await repo.send(a.ctx, a.event.id, key, input, 'test');
      expect(replay).toMatchObject({
        ok: true,
        replayed: true,
        campaign: { campaign: { id: attemptedCampaigns[1] } },
      });
      expect(
        (
          await pool.query(
            'SELECT id FROM email_outbox WHERE organization_id=$1',
            [orgId],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
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
});
