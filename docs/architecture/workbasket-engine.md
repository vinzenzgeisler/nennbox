# Smarter Arbeitskorb: engine and data layer

This documents the engine/data layer and administrative UI of #194 (wave 2 of #196). All findings are advisory. Admission,
document reminders, payment reminders and promotion still require explicit
confirmation through the existing action services. In particular, a
`waitlistPromotion` task does not reserve a seat: the existing #29
`StartNumberService.promoteNext` performs the authoritative capacity check and offer.

## Configuration

All 13 rules are enabled by default. Organization overrides are inherited by
events; event overrides win **per field**. PUT replaces the stored override
object, not the resolved configuration; PUT {} restores inheritance.

| Rule ID | Meaning | Threshold/default |
| --- | --- | --- |
| ready | Complete documents, paid, no enabled entry warning | enabled |
| missingDocuments | Required uploads missing/rejected since registration | days: 7 |
| paymentOpen | Unpaid from X calendar days before closing, including overdue | days: 7 |
| displacement | Displacement outside inclusive class bounds | class min/max |
| year | Manufacture year outside inclusive class bounds | class min/max |
| expiredLicense | License expired before event day | expiry day itself valid |
| expiredDocument | Latest non-rejected document expired before event day | expiry day itself valid |
| minorGuardian | Under 18 on event day without named guardian | birthday inclusive |
| duplicateStartNumber | Same effective number across the event | enabled |
| duplicatePerson | Name + birth date or normalized email | enabled |
| duplicateVehicle | Shared vehicle ID, VIN or registration | enabled |
| capacityNear | Occupancy at/above threshold | percent: 90 |
| waitlistPromotion | Capacity available for waiting registrations | existing class capacity |

Example override: `{"missingDocuments":{"days":3},"duplicatePerson":{"enabled":false}}`.
Days must be nonnegative safe integers; percent must be finite, greater than zero
and at most 100; enabled must be boolean. Unknown keys and coercion are rejected.
Class limits and double-start permission are event-class data; default limits
are open and double starts are not exempted unless both different classes allow
them. Same-class duplicate applications remain warnings. Empty identities never
match. Entry tasks and warnings ignore withdrawn, deleted and rejected
registrations; capacity deliberately counts rejected registrations (see below). Rules never
guess missing birth dates, displacement, year or expiration dates.

Rule input storage adds VIN, license-valid-until, document-valid-until and class
limits/double-start permission. Existing records retain null/open limits, so no
MSC-specific assumptions are introduced. Class limits and double-start permission are available through the existing class API. Editing controls for this metadata are
part of the later UI slice; the repository schema can already store these facts.

## Cache and consistency

The increment is an **event dependency component**, not an individual entry:
person/vehicle duplicates, start numbers and capacity have event-wide dependencies.
PostgreSQL triggers mark only affected organization/event components dirty inside
the writing transaction, including writes outside the API. Changes to shared
people/vehicles invalidate every referencing event of that organization; changes
to organization defaults invalidate its events. Event settings, class data,
entries, groups, invoices/ledger, required document types and document reviews
also invalidate the component. Deleting/moving records considers old and new scope.

The first read after a change recomputes that event once; unchanged reads fetch
the stored JSON and counters without reading entry/person/vehicle/document tables.
No global entry scan runs per page request. Cache row locks serialize consumers only. Writers append independent transactional
invalidation rows and never lock the event cache. Under its cache lock a reader
drains visible signals **before** loading sources; later writer commits remain
pending for the next read. A failed projection rolls back both the drain and
cache update, preventing lost signals. Several changes before a read are bundled
into one generation; there is no time debounce or deliberately stale interval. Generation increases
only on recalculation. Configuration and snapshots are read in the transaction.
Time-based rules expire the cache at the next organization-local midnight or
next outstanding waitlist deadline, whichever comes first.

Status references are resolved against each entry's tenant-scoped, pinned workflow
revision (stable ID, or key for legacy revisions). Raw references remain in
`statusKey`; rules consume only the category. Unknown references fail projection
instead of producing an admission suggestion. Changing the current revision does
not reinterpret existing entries.

Capacity follows #29 for standard statuses: every non-withdrawn, non-waitlisted registration occupies a place (including pending applications), plus unexpired waitlist offers. Already-sent offers are not proposed again before the existing expiration worker has processed them.
For custom workflows the advisory projection applies these same **category**
semantics; the older #29 mutation service still compares literal raw statuses.
This existing custom-workflow limitation of that service is not changed here:
a workbasket suggestion is not proof of eligibility for an authoritative offer,
and callers must still invoke the existing action service (never mutate from a
projection). In particular, rejected entries still count towards capacity, but
do not receive reminders, duplicate warnings or admission tasks.

The pure core receives its clock/calendar values as input and has no HTTP,
database or runtime clock dependency. Tasks carry stable ruleId, entryId (null
for class findings), classId, German reason, evidence field names and severity.
Tasks additionally carry an office projection: \`entry\` (name, effective start number,
organization code, class name, creation time), \`className\`, \`ageDays\`, bilingual
\`detail\` (de/en), raw rule \`values\`, and \`relatedEntries\` with per-neighbour
matching evidence. Required document names and latest valid-until document names
are loaded tenant/event-scoped. Missing-document age is actual calendar days,
not the configured threshold. Class findings have a null entry and age.
API consumers display these facts without inferring their own rules.
Duplicate projections link one real, non-exempt counterpart per matching identity
dimension (at most five for vehicles, two for people); this bounds output even
for fully colliding input. Evidence on each link belongs to that particular
counterpart, not the union across all matches. The legacy reason/fields remain
compatible for other warning consumers. Deployment migration invalidates old caches.

## HTTP API

All paths are member-only with explicit permissions and UUID validation.

- GET /admin/events/:eventId/workbasket — entry:read; tasks, counts by rule, generation.
- GET /admin/events/:eventId/entries/:entryId/warnings — entry:read; entry warnings.
- GET /admin/events/:eventId/workbasket/configuration — event:read.
- PUT /admin/events/:eventId/workbasket/configuration — event:write.
- GET /admin/organization/workbasket/configuration — organization:read.
- PUT /admin/organization/workbasket/configuration — organization:update.

Foreign event/entry IDs return 404 without leaking cache/configuration data.
Every persistence query and correlated source lookup is organization-scoped;
composite foreign keys prevent cache/configuration crossing tenant boundaries.
The PostgreSQL integration test proves cache reuse, invalidation, concurrent
read reuse, time expiry, configuration inheritance and cross-tenant denial.

## Administrative UI

The overview starts with “Heute zu tun”. Findings are ordered by warning,
reminder/capacity task, then admission. Rule counts, reasons and evidence come
from the server projection; filtering and paging only change presentation.
Entry tasks open their exact entry; class tasks open the class-filtered list.
The entry list shows compact findings with a filter explicitly scoped to the
current page. Detail findings sit beside the implicated driver, vehicle,
start-number or document fields. Failed warning reads are not treated as clean
entries.

Bulk admission prepares a named target list and asks for an audit reason.
The detail response now includes `acceptanceTransitions` with category and
German label, resolved against the entry's pinned workflow and filtered by the
same permissions/roles as `availableActions`. The browser never infers an
accepted category from a status key or the event's latest workflow. Before each
sequential transition call it refreshes both advisory eligibility and
permissions. The explicit `requireReadyForEvent` request intent additionally
requires a fresh server evaluation in the same transaction as the transition.
An admission must target an authorized accepted-category status in the pinned
workflow; a pinned-revision/status CAS rejects concurrent workflow/status drift.
Changed readiness is reported per entry as skipped with its current reason.

Authoritative admission and confirmed reminder enqueue run in PostgreSQL
`SERIALIZABLE` transactions. All live source/configuration/pinned-workflow reads
and the status/audit or campaign/outbox/job writes share one snapshot and commit.
SSI tracks predicate dependencies, including absent documents/invoices, without
blocking unrelated source writers. A concurrent change may be ordered after the
action; a serialization failure rolls back and re-evaluates the entire action
against a new snapshot. Advisory cached reads remain outside this boundary.

Retry SQLSTATE `40001` (serialization failure) and `40P01` (deadlock), including
wrapped driver causes, at most three attempts with short bounded backoff. On
exhaustion return an actionable concurrent-change error (HTTP 409). The reminder
client retains the immutable request/key for retry, not a new confirmation.
Ordinary transitions
and unconfirmed campaigns keep their existing transaction behavior.

Reminder enqueue additionally locks existing registration groups `FOR UPDATE`
in ID order, with organization and event predicates. This preserves the
address/payment race guarantee (including new invoice FK inserts) without a
relation-wide lock or locks in another event. These row locks do not replace
SSI's phantom protection. No action takes a table-level writer barrier.

Retry callbacks perform database work only: mail delivery happens later via
transactional outbox/jobs. Rollback removes tentative campaign, recipients,
audit, outbox and jobs together. The immutable request and tenant-scoped
idempotency key survive retries and response loss; committed replays return the
original campaign before new eligibility/recipient resolution. Never send mail
or perform other irreversible external effects inside the retry callback.
Results distinguish successful entries from skipped/failed ones.

Document/payment reminders use editable templates, the existing rendered
recipient preview, explicit recipient counts and confirmed campaign creation.
The preview includes exclusions; eligibility and recipient identity are checked
again before sending. The send request includes the confirmed rule and exact
recipient identities; inside the enqueue transaction the server rejects any
change in eligibility or recipient identity/count, never extending the confirmed
set. An uncertain campaign response keeps the same immutable request body and
idempotency key in session storage scoped to event/rule, surviving changed task
sets, remounts and same-tab navigation/reload. Storage errors block new sends.
Idempotent replays return the original campaign before re-resolving changed
recipients or rule eligibility. Queued recipients are not labelled as sent; the result
supports status refresh and lists per-recipient failures.

## Follow-up

Editable engine configuration/metadata controls and explicitly confirmed
waitlist promotion interactions remain separate work. This UI does not claim
that a capacity suggestion authorizes a promotion. The issue remains open.
