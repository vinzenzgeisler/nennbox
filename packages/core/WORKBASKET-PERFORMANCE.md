# Workbasket duplicate performance

Duplicate detection in `src/workbasket-duplicates.ts` builds separate normalized
buckets for person name/birth day, email, vehicle ID, VIN, registration and start
number. Empty keys never match; tuple encoding avoids name-key collisions.
Disabled duplicate rules do not read or normalize their identity inputs.

Each bucket counts members per class and members in non-permissive classes.
A member has a conflict if another member is in the same class or either class
does not allow multiple starts. This determines conflict existence without
enumerating pairs, including a bucket containing every entry. Start numbers
remain event-wide and never use the multiple-start exemption.

Evidence is merged per rule and entry, only from dimensions that have at least
one non-exempt counterpart. Identity overlap is not treated as a transitive
conflict group. German reasons, warning severity and admission blocking remain
unchanged. Evidence fields are deterministic; callers should treat them as field
sets, not as an ordering of counterparts.

For a fixed number of identity dimensions, duplicate indexing and evidence
aggregation take O(n) work and O(n) memory, including fully colliding data.
The complete projection still sorts entries/tasks (O(n log n)) and scans class
members for capacity (O(classes × n)); this is not an incremental or debounced
projection and makes no claim about database cache-lock behavior.

## Regression checks

Run from the repository root:

```sh
npx vitest run packages/core/src/workbasket-performance.test.ts packages/core/src/workbasket.test.ts packages/core/src/workbasket-capacity.test.ts --maxWorkers=1
```

The performance suite asserts a deterministic budget of at most seven string
normalizations per entry for both unique and fully colliding 300/500-entry
snapshots. It also checks disabled-rule input reads and compares evidence with
the pairwise oracle on seeded mixed-class data, including reversed input order.
It deliberately avoids elapsed-time assertions on shared CI hosts.

An active negative control against the original evaluator fails the work-budget
assertions: 538,200 normalizations for 300 entries (budget 2,100), and 1,497,000
for 500 (budget 3,500). The optimized evaluator passes both. All six new performance test cases were also
run against the original evaluator and failed (including disabled-rule reads and
the mixed-class oracle's linear-work budget); the optimized version passes all six.

## Local full-projection benchmark

One warmup, then eight measurements; ten classes; unique persons, emails,
vehicles, VINs and registrations, matching the review's original data shape.
Shared development host: timings are observations, not an SLA.

| Entries | Original median | Indexed median | Improvement |
| ------- | --------------- | -------------- | ----------- |
| 300     | 83.797 ms       | 3.071 ms       | 27.3×       |
| 500     | 229.217 ms      | 3.458 ms       | 66.3×       |

Fully colliding person/vehicle buckets: medians 2.603 / 4.466 ms (300 / 500).
All duplicate rules disabled: medians 1.377 / 3.076 ms.
The benchmark's original-review fixture has no start numbers; start-number
collisions are covered by the operation-count regression instead.

## PostgreSQL end-to-end measurement

The dependency component remains the event: duplicates and capacity can change
other entries' findings. Writers append invalidation signals without waiting for
the cache; multiple writes before a read are bundled into one rebuild. Linear
duplicate indexing replaces the dominant pairwise work rather than introducing
a partially correct single-entry delta or stale time-debounce.

Local PostgreSQL 16, 500 entries, separate person/vehicle/group per entry, one
required document type. Six individual updates followed by a read, then unchanged
reads; shared host with other work running. These are observations, not an SLA.

| Measurement                        | Original review                 | Revised projection             |
| ---------------------------------- | ------------------------------- | ------------------------------ |
| Cold read                          | 519 ms                          | 186.47 ms                      |
| Update + projection (read portion) | 459.66–697.41 ms, median 561.85 | 95.00–200.61 ms, median 128.14 |
| Unchanged reads                    | 1.89–4.83 ms                    | 3.99–13.54 ms                  |

An earlier less-contended revised run measured 81.62–104.02 ms (median 86.30).
A contended run during local gates measured 310.01–394.79 ms (median 318.88);
host scheduling remains material. There is no claim that all deployments achieve
the best observed numbers.

A final 20-cycle load probe requested one change every 200 ms and four concurrent
readers after each change. It completed at 4.96 changes/s; all four readers shared
exactly one generation per cycle. Read-batch latency was 115.69–200.15 ms
(median 149.61). Ten writes before four parallel reads also caused exactly one
generation increment. No writer errors occurred. The two-connection regression
separately proves that a read cannot consume an uncommitted writer's signal.

Database probe source and raw JSON are retained in MSC
`review/pr233-fix-evidence/db-benchmark.mts` and
`db-benchmark-final.json`. The targeted rollback and concurrency regressions
also test failed projection rollback and a writer committing during another open
writer transaction.

Reproduction script and raw before/after measurements are review artifacts in
`review/pr233-evidence/perf-core-benchmark.mjs`,
`perf-core-before.json`, `perf-core-after.json` and
`perf-negative-control.log` under the MSC development directory.
