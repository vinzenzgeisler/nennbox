import { createRequestContext, organizationId } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { workbasketSeed } from './workbasket-test-fixture.js';

/**
 * Workflow whose keys deliberately differ from the standard ones, plus decoys:
 * statuses literally named like a standard key but carrying another category.
 * Anything that still compares raw keys picks the wrong side.
 */
const statuses = (waitlist: boolean) => [
  { id: 'pending', key: 'pending', category: 'pending' },
  { id: 'ok-1', key: 'display-open', category: 'accepted' },
  { id: 'gone-w', key: 'display-gone-w', category: 'withdrawn' },
  { id: 'gone-w2', key: 'display-gone-w2', category: 'withdrawn' },
  { id: 'gone-r', key: 'display-gone-r', category: 'rejected' },
  { id: 'withdrawn', key: 'display-decoy-w', category: 'accepted' },
  { id: 'rejected', key: 'display-decoy-r', category: 'accepted' },
  { id: 'accepted', key: 'display-decoy-a', category: 'pending' },
  ...(waitlist
    ? [{ id: 'wait-1', key: 'display-wait', category: 'waitlisted' }]
    : []),
];

export function pathWorkflow(waitlist = true) {
  const list = statuses(waitlist).map((status) => ({
    ...status,
    labels: { de: status.id, en: status.id },
    color: '#112233',
  }));
  return {
    version: 1,
    statuses: list,
    transitions: list.flatMap((from) =>
      list
        .filter((to) => to.id !== from.id)
        .map((to) => ({ from: from.id, to: to.id, reasonRequired: false })),
    ),
  };
}

type Pool = Awaited<ReturnType<typeof createDatabase>>['pool'];
type Db = Awaited<ReturnType<typeof createDatabase>>['db'];

export async function seedPaths(
  db: Db,
  pool: Pool,
  label: string,
  options: {
    max?: number | null;
    waitlist?: boolean;
    automaticPromotion?: boolean;
  } = {},
) {
  const seed = workbasketSeed(db);
  const a = await seed(label);
  const revision = (
    await pool.query(
      "INSERT INTO entry_workflow_revision(organization_id,event_id,version,workflow,actor,reason) VALUES($1,$2,2,$3,'test','paths') RETURNING id",
      [
        a.org.id,
        a.event.id,
        JSON.stringify(pathWorkflow(options.waitlist ?? true)),
      ],
    )
  ).rows[0].id as string;
  await pool.query(
    'UPDATE entry_workflow_current SET workflow_revision_id=$1 WHERE organization_id=$2 AND event_id=$3',
    [revision, a.org.id, a.event.id],
  );
  await pool.query('DELETE FROM entry WHERE id=$1', [a.entry.id]);
  const slug = `paths-${crypto.randomUUID()}`;
  await pool.query("UPDATE event SET status='open', slug=$2 WHERE id=$1", [
    a.event.id,
    slug,
  ]);
  await pool.query('UPDATE event_class SET max_participants=$1 WHERE id=$2', [
    options.max === undefined ? 1 : options.max,
    a.klass.id,
  ]);
  await pool.query(
    'INSERT INTO event_waitlist_settings(organization_id,event_id,automatic_promotion,confirmation_hours) VALUES($1,$2,$3,48)',
    [a.org.id, a.event.id, options.automaticPromotion ?? true],
  );
  const ctx = createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(a.org.id),
    permissions: new Set(['entry:write', 'entry:read', 'event:write']),
    capabilities: new Set(),
    correlationId: crypto.randomUUID(),
  });
  let sequence = 0;
  const addEntry = async (
    status: string,
    extra: {
      classId?: string;
      waitlistPosition?: number;
      assigned?: string;
      requested?: string;
    } = {},
  ) =>
    (
      await pool.query(
        `INSERT INTO entry(organization_id,event_id,class_id,registration_group_id,driver_person_id,vehicle_id,orga_code,workflow_revision_id,acceptance_status,waitlist_position,assigned_start_number,requested_start_number,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + ($13 || ' seconds')::interval) RETURNING id`,
        [
          a.org.id,
          a.event.id,
          extra.classId ?? a.klass.id,
          a.group.id,
          a.person.id,
          a.vehicle.id,
          crypto.randomUUID(),
          revision,
          status,
          extra.waitlistPosition ?? null,
          extra.assigned ?? null,
          extra.requested ?? null,
          String(sequence++),
        ],
      )
    ).rows[0].id as string;
  const row = async (id: string) =>
    (
      await pool.query(
        'SELECT acceptance_status AS status, acceptance_category AS category, waitlist_position AS position, waitlist_offer_sent_at AS offered FROM entry WHERE id=$1',
        [id],
      )
    ).rows[0] as {
      status: string;
      category: string | null;
      position: number | null;
      offered: Date | null;
    };
  const cleanup = async () => {
    // Public submissions queue mail that references the event.
    await pool.query('DELETE FROM email_outbox WHERE organization_id=$1', [
      a.org.id,
    ]);
    await seed.cleanup();
  };
  return { ...a, slug, ctx, revision, addEntry, row, cleanup };
}
