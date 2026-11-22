# Entry status meanings and dimensions

Entry workflow statuses retain their event/organization-specific keys and labels and map to one of six stable meanings: `new`, `in_progress`, `missing`, `done`, `rejected`, or `not_relevant`. Existing workflow revisions without a meaning are normalized from their legacy category when read; stored history is not rewritten. The legacy workflow `color` field is preserved for compatibility, but meaning—not that field—is the semantic contract. The backend does not prescribe a single UI color per meaning. M6 uses a multi-channel presentation: for example, `in_progress` pairs a Sage background (`#E4EAE3`) with a Green marker (`#193B30`), `missing` uses a Marshal marker (`#E2531F`), `rejected` uses Graphite (`#4F5A54`) without a signal color, and `not_relevant` uses `#6B746F`. Presentation clients should consume meanings and the approved M6 tokens rather than treating a workflow's legacy color as a status token. Workflow changes continue to use the workflow revision and transition audit mechanisms.

## Dimensions

Every entry exposes a status projection with these independent dimensions:

| Dimension | Default source / values | Management |
| --- | --- | --- |
| Nennung | Existing pinned entry workflow | Existing workflow management and transitions |
| Zahlung | Registration-group invoice (`open`, `partially_paid`, `paid`, or `cancelled`); no invoice means `not_required` | Existing invoice/payment management |
| Technische Abnahme | `pending` → `reinspection` → `passed` (or `pending` → `passed` / `not_relevant`) | Event-scoped status-dimension configuration and audited entry transition |
| Haftverzicht | `f_pending` → `f_signed` / `bf_signed` / `not_relevant` | Event-scoped status-dimension configuration and audited entry transition |
| E-Mail | Existing registration-group email verification (`unverified` / `verified`) | Existing verification flow |

The event configuration is stored in PostgreSQL and read through the event's organization scope. Admins with `event:write` manage it at `GET`/`PUT /admin/events/:eventId/status-dimensions`; the config is versionable through its before/after audit record. Removing a value that is currently in use is rejected with HTTP `409 Conflict`. Manual technical-inspection and waiver transitions use `POST /admin/entries/:entryId/status-dimensions/:dimension/transitions`, require `entry:write`, and require an audit reason. Other dimensions are projections of their existing sources and cannot be manually overwritten through this endpoint.

Configuration contains the event's allowed values, localized labels, transition edges, and per-value next-action text. Omitted configuration uses the built-in defaults. Invalid or incomplete configurations are rejected; client-supplied projected statuses or tenant identifiers are not accepted. Tenant and event identity are resolved from the authenticated request and entry/event records.

Each projected dimension includes its next action. `underlagen` is a derived `x/y` counter for technical-inspection plus waiver documents; it is not an independent status dimension. Projection returns the independent status values as well as the workflow status, preserving existing event and organization isolation.

## Hints and derived signals

The projection can include `double_starter`, `passenger`, and `late_entry` hints without turning them into statuses. `double_starter` is derived when one driver has multiple active entries for the event; `late_entry` is derived from the event registration-close time and entry creation time. Admins can add audited boolean hints through `PUT /admin/entries/:entryId/status-hints` (requires `entry:write`). The current entry model does not contain a passenger/driver-seat relationship, so `passenger` is an explicitly maintained boolean hint rather than an inferred fact. Hint writes merge only supplied booleans and cannot change an entry's status.

## Compatibility

The migration adds only nullable/configuration/audit structures and losslessly backfills default technical-inspection and waiver states. Existing workflow, payment, and email source records remain authoritative and unchanged. Status projection is returned on admin entry reads; no frontend behavior is part of this backend change.

## Entry detail source fields

`requestedStartNumber` records the driver's wish; nullable `assignedStartNumber`
records the actual confirmed/allotted number. `startNumberStatus` is `assigned`
when an allocation exists, `requested` when only a wish exists, otherwise
`unassigned`. Admin details, exports, driver portal and timing use only the
allocation as `startNumber`. These new entry fields are optional in contracts.
Driver-choice submissions confirm a valid free wish immediately; automatic mode
allocates without manufacturing a wish. Organizer-assigned wishes stay pending
until assignment. Manual and bulk allocation preserve the original wish.
Both wishes and allocations reserve numbers across active entries in the same
organization/event, including concurrent writes; withdrawal/deletion releases
both claims. The original requested-number unique index remains in place.
Migration confirms valid historical driver-choice/automatic numbers; ambiguous
organizer-assigned values remain wishes. No-range legacy events retain the
historical driver-choice default.

The `double_starter` hint retains `key` and boolean `present` and optionally adds
`relatedEntries: [{ entryId, startNumber }]`. References contain all other
non-deleted entries for that event/driver, not only the current page/class filter,
and expose confirmed numbers only (otherwise null). Stored boolean hints remain
valid even without related entries.

Invoices expose optional nullable `paidAt`, persisted from the invoice payment
ledger's `occurred_at` at the start of the current fully-paid period. The shared
invoice-status trigger covers manual office payments, bank-transfer imports,
provider payments and invoice amount corrections. Refunds/reversals below the
total clear the date; repayment starts a new period; overpayments preserve it.
Backfill replays the ledger, never checkout creation times. Historical paid
invoices without payment evidence remain undated. Public registration submission
responses do not change.

## Admin UI consumption

List, detail and preview reserve “Nr.” for `assignedStartNumber`; the compact
“Wunsch” label keeps a different requested number visible. `startNumberStatus`
can explicitly rule out an allocation. With older optional-field responses, the
UI still shows wishes but does not treat legacy `adminDetails.startNumber` as
proof of assignment: that field previously echoed the wish. The existing sort
contract remains wish-based and is labeled “Wunschstartnummer”.

Manual assignment re-reads the authenticated entry detail after the write; it
does not overwrite the wish or infer assignment from the submitted value. Related
starter references use existing detail-host navigation only when supplied;
list and preview references are informational. Invoice payment dates appear only
when `paidAt` exists, never from creation or history fallbacks.
