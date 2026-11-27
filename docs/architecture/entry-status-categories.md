# Entry status decisions

Resolve an entry's category with `entryStatusCategory()` / SQL
`entry_status_category(organization_id, workflow_revision_id, acceptance_status)`.
The resolver reads only that tenant's pinned revision, uses `id ?? key`, and
raises for missing categories. Never use the current workflow or the raw key as
a category fallback.

## Which entries hold a place

One rule, three mirrors that must agree:

| Category | Class seat | Start number |
| --- | --- | --- |
| `pending`, `accepted` | yes | yes |
| `waitlisted` | only while its confirmation offer is open | yes |
| `withdrawn`, `rejected` | **no** | **no** |

A rejected entry releases its seat exactly like a withdrawn one and triggers the
waitlist promotion. This holds for public registration, class change, admin
actions, workbasket, event overview and start-number capacity alike. The rule is
`releasesPlace()` / `holdsClassSeat()` in `@nennbox/core` (workbasket),
`entryHoldsPlace()` / `entryHoldsClassSeat()` in `entry-occupancy.ts` (SQL
queries) and `entry_category_holds_place()` (index predicates and claim trigger,
migration 0053). `entry-status-migration.integration.test.ts` tests that core and SQL answer
identically for every category.

Consequence for numbers: a released entry keeps its stored numbers, but they are
free for others. Reactivating it while another entry holds the number fails with
a unique violation, the same as for withdrawn entries before.

## Reactivation into a full class

When an acceptance transition takes an entry out of `withdrawn` or `rejected` into
a category that holds a seat, the class row is locked and occupancy counted
(excluding the entry). If the class is full the entry is placed at the tail of the
waitlist instead of overbooking: its status becomes the first `waitlisted` status
of its pinned workflow, it gets the next waitlist position and a second audit row
(`actor: system`, `reason: class_full_reactivated_to_waitlist`) records the
redirect. The notification of the requested target is not sent, because it would
announce a status the entry does not have. Reactivation directly into a
`waitlisted` status is unchanged.

## Workflow without a waiting status

Whether a waiting status is needed depends on class capacity, which a workflow
cannot know, and existing workflows without one are valid. So the workflow
validator is unchanged; the refusal happens where the waitlist is needed:

- public registration into a full class: `RegistrationUnavailable` with reason
  `waitlist-unavailable`; the whole submission rolls back (nothing is created);
- reactivation into a full class: the transition fails with
  `class_full_no_waitlist` (HTTP 409 with that reason, shown to office users);
  the entry stays withdrawn/rejected.

Classes with free seats and unlimited classes work without a waiting status.

## Upgrade preflight (migration 0053)

Migration 0053 now treats entries by pinned category. Legacy data that coexisted
only because of raw-key matching (for example an accepted custom status keyed
`withdrawn` sharing a start number with another entry) would make
`CREATE UNIQUE INDEX` fail. The migration starts with a preflight that stops with
`Migration 0053 blocked: start number N of event E is held by several entries:
<orga code> (<id>), ...` before changing anything. To list all collisions in
advance (read-only):

```sql
SELECT e.event_id, n.number, array_agg(e.orga_code ORDER BY e.orga_code) AS entries
FROM entry e
CROSS JOIN LATERAL (VALUES (e.requested_start_number), (e.assigned_start_number)) n(number)
WHERE e.deleted_at IS NULL AND n.number IS NOT NULL
  AND coalesce((SELECT s->>'category'
                FROM entry_workflow_revision r, jsonb_array_elements(r.workflow->'statuses') s
                WHERE r.organization_id = e.organization_id AND r.id = e.workflow_revision_id
                  AND coalesce(s->>'id', s->>'key') = e.acceptance_status), '')
      NOT IN ('withdrawn', 'rejected')
GROUP BY e.organization_id, e.event_id, n.number
HAVING count(DISTINCT e.id) > 1;
```

Resolve each row by withdrawing, rejecting or renumbering all but one entry, then
rerun the migration. The migration is atomic: a refused run changes nothing.

- `waitlist-offer.ts`: occupancy uses the shared seat rule below; FIFO
  selection, expiry and tail positions use the waitlisted category.
- `registration-submit-waitlist.ts`: tail position uses the category; assigning
  a waiter resolves the target key from its pinned revision (first `waitlisted`
  status in workflow order); a workflow without one is refused, see below.
- `registration-submit-participant.ts`: used numbers and class capacity use the
  shared rule below.
- `start-number-assignment.ts`: accepted candidates compare categories; used
  numbers use the shared place rule.
- `registration-start-number.ts`: public availability uses the place rule.
- `entry-admin-action-class.ts`, `entry-admin-actions.ts`: class capacity and
  action discovery use the seat rule.
- `event-overview.ts`: grouped categories use the resolver; class occupancy
  uses the seat rule; no fallback to raw keys.
- `entry-reactivation.ts`: see "Reactivation into a full class".
- `driver-portal-mutations.ts`: the "last active entry" check compares the
  withdrawn category, not the raw key of the status the portal picked.
- `entry-group-activity.ts`: active groups use the pinned category; a custom
  status literally named withdrawn/rejected no longer overrides its category.
- `registration-submit-response.ts`: public pending/waitlisted response values
  are categories, not custom workflow keys.
- `entry-transition-method.ts`, `refund-transition.ts`: cancellation side effects
  and refund/reactivation guards use the pinned target category, never a raw-key
  fallback or a raw-key override of an explicit category.
- `driver-portal-mutations.ts`, API `routes/driver-portal.ts`: editing, withdrawal
  and upload eligibility use the category returned by the ownership lookup.
- `workbasket-snapshot.ts`: uses the same resolver as the mutations.
- `driver-portal-access.ts`, `timing-repository.ts`: existing category lookups
  now share the resolver and fail on unknown keys.
- SQL partial unique indexes for requested/assigned numbers, the waitlist index,
  and `sync_entry_start_number_claims()`: migration 0053 supersedes the raw
  predicates from 0003/0038/0040. A trigger-maintained category projection is
  necessary because index predicates cannot query workflow revisions. It is
  refreshed after revision pinning on every write, including direct SQL.
  Unknown legacy statuses retain number reservations conservatively; business
  queries still fail loudly. Repinning also refreshes number claims.

## Intentionally retained raw-key uses

- Repository/API filters, counts grouped for display, exports, messaging status
  filters and UI selected filters compare the exact status selected by the user.
- Workflow transition edges, optimistic concurrency predicates, driver-portal
  transition targets and client response verification compare identity, not
  category. Several states can share a category.
- Projection and presentation preserve the original key for labels and workflow
  actions. Status defaults and seed fixtures intentionally create states in the
  default workflow; these are writes, not category decisions.
- Core `status-projection.ts` requires the pending system identity to have the
  pending category: this is workflow validation, not an entry decision.
- Historical migrations and generated snapshots are immutable upgrade history;
  effective index/trigger behavior is replaced in 0053.

## Unread workbasket invalidations

Each invalidation appends its own transactional signal, then prunes visible
surplus signals of the same tenant/event, retaining at most 255 other signals.
Only surplus rows are locked, using SKIP LOCKED; writers do not share a cache or
event lock. Concurrent in-flight writes can temporarily exceed 256 signals;
subsequent writes prune this surplus. A writer never deletes its own new signal,
so a concurrent reader cannot lose that writer's invalidation.

Run `node scripts/waitlist-category-counterchecks.mjs` against a disposable
migrated `NENNBOX_TEST_DATABASE_URL`. It proves the four custom-workflow tests
fail with the original waitlist implementation, the unread-log test fails with
the original append-only function, and all pass after restoration.
