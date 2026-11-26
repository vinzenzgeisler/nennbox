# Team backend (#240, identity contract #4)

Identity is scoped by OIDC issuer and subject, never by email alone. Memberships
are scoped by organization and identity. Claims cannot grant organization rights.
Every request resolves active membership permissions, including Cloud contexts.
Team changes re-check the actor's active Administrator membership inside the
transaction, after taking the organization-scoped advisory lock shared with
first-admin bootstrap. All team writes and redemption use this lock; there are
no table-wide locks. Direct operator SQL is outside the application API contract.

## Role mapping

| Stable key | Label | Read | Write |
| --- | --- | --- | --- |
| admin | Administrator | all | organization, events, classes, entries, on-site inspection/waiver, payments, timing, team |
| office | Nennbüro | all | entries, entry messages, on-site inspection/waiver |
| cashier | Kasse | all | payments |
| scrutineer | Abnahme vor Ort | all | on-site inspection/waiver only |
| viewer | Nur lesen | all | none |

The authoritative mapping is Core's tested permissionsForRole. Role markers
role:<key> also constrain workflow transitions. The migration keeps admin as the
stable Administrator identifier and migrates member to viewer, preserving identity,
organization, timestamps and active/disabled status.

### On-site inspection permission

`entry:inspect` allows only technical-inspection and waiver dimension transitions
(and, when implemented, stamp cards). Administrator, Nennbüro and Abnahme vor Ort
receive it; Kasse and Nur lesen do not. Both API and repository enforce it.
`entry:write` alone does not authorize these dimensions. Conversely,
`entry:inspect` never authorizes general field edits, admission, rejection or any
entry-workflow transition. Configuration still requires `event:write`.
Entry messages use `entry:write`; saving templates remains a setting.
Read-only artifact generation remains available under `entry:read`.

Inspection guards have independent HTTP and PostgreSQL role-matrix tests,
including a synthetic `entry:write`-only caller. With a migrated disposable database
in `NENNBOX_TEST_DATABASE_URL`, run `node scripts/entry-inspection-counterchecks.mjs`
to verify eight removed/replaced guards turn the tests red; it restores each
source file after its countercheck. Run it separately from other tests because it
intentionally mutates source files temporarily. Role permissions are derived from the current membership on every request.
Migration `0052_membership_last_sign_in` adds a nullable login timestamp without
changing any historical membership timestamps.

## API

All team administration endpoints require a current Administrator membership:

- GET /admin/team: members, invitations (never token hashes), actor/time history.
- POST /admin/team/invitations: { email, role, lifetimeSeconds? }; returns ID only.
- POST /admin/team/invitations/:id/revoke.
- POST /admin/team/invitations/:id/resend: rotates token, preserves expiry;
  only unexpired, unrevoked, unused invitations can be resent.
- PATCH /admin/team/members/:id: { kind: "role", role } or
  { kind: "status", status: "active" | "disabled" }.
- POST /auth/invitations/redeem: { token }; requires the configured OIDC
  authenticator but no prior membership. Cloud supplies its verified authenticator
  in addition to tenant context resolvers. Verified email must match after trimming
  and lowercasing, with IDNA domain normalization as described below. Existing memberships cannot be overwritten or reactivated via
  invitation. Explicit Administrator reactivation is required instead.

Unknown tenant-scoped targets return 404. Last-admin changes and invalid invitation
lifecycle changes return 409. Invalid/foreign/used redemption returns 403. Missing
mail origin returns 503 and rolls back the invitation.

## Expiry and delivery

Community environment configuration (seconds):

- TEAM_INVITATION_DEFAULT_SECONDS: 604800 (7 days).
- TEAM_INVITATION_MINIMUM_SECONDS: 3600 (1 hour).
- TEAM_INVITATION_MAXIMUM_SECONDS: 2592000 (30 days).

All values must be positive safe integers, ordered minimum <= default <= maximum.
Cloud can supply invitationLifetime to createProductApi. Individual invitations
may specify a lifetime within these bounds.

API and worker must share TEAM_INVITATION_TOKEN_KEY: a secret, random 32-byte key
encoded as 64 hexadecimal characters (generate with openssl rand -hex 32).
Keep it outside the database and source control. Missing/invalid keys fail closed.
Community: `scripts/community-config.mjs` generates the key once into `.community-local/config.json`, and `community-up.sh` exports it to API and worker.
Cloud supplies invitationTokenKey to both product assemblies. Drain queued mail
before rotating the key; otherwise revoke and resend pending invitations.

Tokens are HMAC-SHA-256 over a fresh 32-byte random nonce, derived with this key.
Only SHA-256 token digests are stored in team_invitation;
neither tokens nor hashes are exposed through the team API or history. The
transactional mail outbox carries only the public random nonce and role. The
worker derives the token in memory and constructs the canonical tenant link just
before SMTP delivery. Neither bearer tokens nor the signing key are persisted in
outbox/job/history data, so database-only reads/backups cannot reconstruct them.
Resending invalidates every previous delivery link. The worker renders the
team-invitation template and checks its link against the canonical tenant origin.
The fragment-based link keeps the token out of HTTP request URLs. The future
invitation page must retain it over OIDC login and POST redemption explicitly;
visiting a link alone never consumes it. The invitation page is intentionally
not implemented pending the design source.

Each mutation, including invite redemption and resend, records actor issuer,
subject, timestamp, target, and role/status changes in team_history in the same
transaction. No global identity is deleted on deactivation.

## Action discovery

`routes/entry-action-permissions.ts` supplies the permission keys to both entry
`availableActions` discovery and the corresponding HTTP mutation endpoints:
admin actions (`change_class`, `adjust_amount`, `delete`, `note:*`), acceptance
transitions, message campaigns, start numbers, and passenger actions all require
`entry:write`. Workflow role/edge restrictions and passenger-state eligibility
remain additional restrictions, never permission grants. Office can discover and
send messages; cashier, scrutineer and viewer cannot. Template settings remain
`event:write` and do not control the entry's message action.

## Email policy

Both invitation input and the verified identity email at redemption use Core's
`normalizeTeamEmail`, at the HTTP boundary and again at the repository boundary.
Trim and lowercase first; convert Unicode domains to ASCII Punycode with the
WHATWG URL IDNA implementation before validation, storage and comparison.
Unicode local parts (SMTPUTF8) are unsupported and return a readable HTTP 400
explaining the ASCII-local-part requirement. Invalid claims cannot consume an
invitation. Dots and plus tags are preserved; no provider-specific alias merging
is performed. Existing invitations created via the supported HTTP API already
have ASCII domains; no email rewrite/backfill is needed.

## Last organization sign-in

`organization_membership.last_signed_in_at` is exposed as `lastSignedInAt`
(ISO timestamp or null) on each team member. The generator-created custom
migration `0052_membership_last_sign_in` leaves existing rows null: `updatedAt`
contains membership changes and cannot reconstruct a login history.

`POST /auth/session` completes the organization sign-in. It uses the configured
member authenticator/context resolver, then updates only the active membership
for the verified issuer+subject and server-resolved organization. It accepts no
client timestamp, identity or tenant input. Community's existing OIDC callback
calls it after successful code exchange with its access token, once even under
concurrent StrictMode restores. The Community Vite proxy forwards `/auth/session`
to the API while `/auth/callback` remains a SPA route; a real HTTP proxy test pins
both paths without starting a browser. Ordinary session restores, GET /admin/session,
team reads and all other authenticated requests do not update it. Cloud auth
clients must call this endpoint after login/organization selection; future invite
clients call it after successful redemption if the membership was just created.
The endpoint records server-side organization-login completion, not a provider's
last authentication time or generic last activity. Disabled/missing memberships
are rejected; membership `updatedAt` is never changed by login completion.

Review-fix counterchecks run against a migrated disposable database with
`node scripts/team-review-counterchecks.mjs`. They restore every mutated source
and must not run concurrently with other test commands.
