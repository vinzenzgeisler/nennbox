import { describe, expect, it } from 'vitest';
import { defaultEntryWorkflow, transitionEntry } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createEntryRepository } from './entry-repository.js';
import { createEntryWorkflowRepository } from './entry-workflow.js';
import { createWorkbasketRepository } from './workbasket.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
describe.skipIf(!url)('authoritative workbasket admission', () => {
  it.each(['withdrawn', 'document', 'payment', 'warning'] as const)(
    'skips a %s change after confirmation, even when the pinned workflow permits admission',
    async (change) => {
      const { db, pool } = await createDatabase(url!);
      const seed = workbasketSeed(db);
      try {
        const a = await seed('admission');
        const ctx = { ...a.ctx, permissions: new Set(['entry:write']) };
        await pool.query(
          'UPDATE vehicle SET displacement_cc=1900 WHERE id=$1',
          [a.vehicle.id],
        );
        await pool.query(
          "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
          [a.org.id, a.event.id, a.group.id, crypto.randomUUID()],
        );
        const workflow = {
          ...defaultEntryWorkflow,
          transitions: [
            ...defaultEntryWorkflow.transitions,
            { from: 'withdrawn', to: 'accepted', reasonRequired: true },
          ],
        };
        const revision = (
          await pool.query(
            "INSERT INTO entry_workflow_revision(organization_id,event_id,version,workflow,actor,reason) VALUES($1,$2,2,$3,'test','custom workflow') RETURNING id",
            [a.org.id, a.event.id, JSON.stringify(workflow)],
          )
        ).rows[0].id;
        await pool.query(
          'UPDATE entry SET workflow_revision_id=$1 WHERE id=$2',
          [revision, a.entry.id],
        );
        const basket = createWorkbasketRepository(db);
        expect(
          (await basket.tasks(ctx, a.event.id))?.tasks.some(
            (t) => t.ruleId === 'ready' && t.entryId === a.entry.id,
          ),
        ).toBe(true);
        // This is the last browser read. All following changes commit before POST.
        if (change === 'withdrawn')
          await pool.query(
            "UPDATE entry SET acceptance_status='withdrawn' WHERE id=$1",
            [a.entry.id],
          );
        if (change === 'document')
          await pool.query(
            "INSERT INTO event_entry_document_type(organization_id,event_id,key,name,required) VALUES($1,$2,'license','Lizenz',true)",
            [a.org.id, a.event.id],
          );
        if (change === 'payment')
          await pool.query(
            "UPDATE invoice SET status='open' WHERE registration_group_id=$1",
            [a.group.id],
          );
        if (change === 'warning')
          await pool.query(
            'UPDATE vehicle SET displacement_cc=3000 WHERE id=$1',
            [a.vehicle.id],
          );
        await expect(
          transitionEntry(
            ctx,
            a.entry.id,
            'acceptance',
            'accepted',
            'test',
            'confirmed',
            {
              entries: createEntryRepository(db),
              workflows: createEntryWorkflowRepository(db),
            },
            { eventId: a.event.id },
          ),
        ).rejects.toThrow('Nicht mehr bereit');
        expect(
          (
            await pool.query(
              'SELECT acceptance_status FROM entry WHERE id=$1',
              [a.entry.id],
            )
          ).rows[0].acceptance_status,
        ).toBe(change === 'withdrawn' ? 'withdrawn' : 'pending');
        expect(
          (
            await pool.query(
              'SELECT count(*)::int n FROM entry_audit_event WHERE entry_id=$1',
              [a.entry.id],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await seed.cleanup();
        await pool.end();
      }
    },
  );
  it('admits a currently ready entry and writes the audit in the same transaction', async () => {
    const { db, pool } = await createDatabase(url!);
    const seed = workbasketSeed(db);
    try {
      const a = await seed('ready');
      const ctx = { ...a.ctx, permissions: new Set(['entry:write']) };
      await pool.query('UPDATE vehicle SET displacement_cc=1900 WHERE id=$1', [
        a.vehicle.id,
      ]);
      await pool.query(
        "INSERT INTO invoice(organization_id,event_id,registration_group_id,total_cents,currency,payment_reference,status) VALUES($1,$2,$3,0,'EUR',$4,'paid')",
        [a.org.id, a.event.id, a.group.id, crypto.randomUUID()],
      );
      const result = await transitionEntry(
        ctx,
        a.entry.id,
        'acceptance',
        'accepted',
        'test',
        'checked',
        {
          entries: createEntryRepository(db),
          workflows: createEntryWorkflowRepository(db),
        },
        { eventId: a.event.id },
      );
      expect(result?.acceptanceStatus).toBe('accepted');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int n FROM entry_audit_event WHERE entry_id=$1',
            [a.entry.id],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await seed.cleanup();
      await pool.end();
    }
  });
});
