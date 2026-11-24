# Smarter Arbeitskorb: engine and data layer

This is the first implementation slice of #194 (wave 2 of #196). No new UI or
bulk mutation is part of this slice. All findings are advisory. Admission,
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
match. Withdrawn, deleted and rejected registrations are ignored. Rules never
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
API consumers must display the reason/evidence without inferring their own rules.

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

## Follow-up

“Today to do” overview, inline list/detail warnings, editable metadata controls,
bulk admission/reminders and explicitly confirmed promotion interactions are not
implemented here. This PR must not close #194 as a whole.
