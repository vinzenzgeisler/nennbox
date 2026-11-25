# Workbasket UI acceptance (#194, part 2)

The workbasket uses the existing administrative App components, tokens and icon
set. No new business rules, automatic mutations, database schema changes or
background jobs are introduced.

## Real-stack acceptance

Run from this worktree using `~/Developer/msc/tools/isolated-smoke.sh
workbasket --workers=1`. On a resource-constrained host, execute the
same script in a transient user systemd worker with `MemoryMax=1600M` and
`NODE_OPTIONS=--max-old-space-size=192`; only one isolated stack is started.
The script removes its containers and processes on completion.

The browser test signs in through Keycloak, uses the seeded Historischer
Bergpreis 2027 (63 entries), and exercises real workbasket, warning, recipient
preview, campaign and entry APIs. It checks live rule filtering, exact entry
navigation, warning filtering, Escape, keyboard activation, reminder recipient
counts and that no campaign is created before confirmation. The read-only cases never confirm a campaign.
`workbasket-campaign.destructive.spec.ts` confirms a real document reminder
campaign and reads per-recipient results in the serial destructive project, after
all shared-data specs finish. The shared-data guard rejects campaign confirmation
in read-only specs.

| Viewport | `innerWidth` | Document width | Horizontal overflow | Touch |
| --- | --- | --- | --- | --- |
| 1440 × 900 | 1440 | 1440 | 0 px | no |
| 1024 × 900 | 1024 | 1024 | 0 px | no |
| 390 × 900 | 390 | 390 | 0 px | yes (`isMobile`, `hasTouch`) |

All three cases check for uncaught page errors and failed HTTP responses. Dialog
content width is checked against its available width. Screenshots of overview,
reminder preview, detail and filtered list can be recorded by setting
`WORKBASKET_EVIDENCE` to a local directory; the desktop result is recorded too.
The local `.workbasket-evidence/` directory is deliberately excluded from Git.

## Unit coverage

Focused tests cover advisory-only warnings, inline field placement within the active detail tabpanel, stale read
cancellation, rule counts/ordering/filtering, quiet/error states, pinned custom
workflow admission targets and permissions, stale admission eligibility,
per-entry partial failures, cancellation, reminder confirmation, queued-vs-sent
feedback and idempotent recovery after uncertain campaign responses.

## Deliberate limits

The inline list warning filter is explicitly scoped to the current page; it
does not masquerade as a server-side whole-event filter. The workbasket overview
itself contains all event findings with local paging. Configuration and editable
rule-input metadata controls remain follow-up work. Capacity findings navigate
to the affected class or entry and never promote from the advisory projection.
