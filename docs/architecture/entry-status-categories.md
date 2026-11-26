# Entry status decisions

Resolve an entry's category with `entryStatusCategory()` / SQL
`entry_status_category(organization_id, workflow_revision_id, acceptance_status)`.
The resolver reads only that tenant's pinned revision, uses `id ?? key`, and
raises for missing categories. Never use the current workflow or the raw key as
a category fallback.

## Audit of fixed-key comparisons

- `waitlist-offer.ts`: occupancy excludes withdrawn, rejected and waitlisted
  categories; active offers, FIFO selection, expiry and tail positions use the
  waitlisted category.
- `registration-submit-waitlist.ts`: tail position uses the category; assigning
  a waiter resolves the target key from its pinned revision.
- `registration-submit-participant.ts`: duplicate-driver and capacity queries
  compare categories, including the active-waitlist-offer capacity exception.
- `start-number-assignment.ts`: accepted candidates and withdrawn reservations
  compare categories.
- `registration-start-number.ts`: public availability compares categories.
- `entry-admin-action-class.ts`, `entry-admin-actions.ts`: class capacity and
  action discovery compare categories (existing capacity policy retained).
- `event-overview.ts`: grouped categories and rejected class occupancy use the
  resolver; no fallback to raw keys.
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
