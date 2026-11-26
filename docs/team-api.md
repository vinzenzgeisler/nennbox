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
| admin | Administrator | all | organization, events, classes, entries, payments, timing, team |
| office | Nennbüro | all | entries and entry messages |
| cashier | Kasse | all | payments |
| scrutineer | Abnahme vor Ort | all | none (see unresolved policy below) |
| viewer | Nur lesen | all | none |

The authoritative mapping is Core's tested permissionsForRole. Role markers
role:<key> also constrain workflow transitions. The migration keeps admin as the
stable Administrator identifier and migrates member to viewer, preserving identity,
organization, timestamps and active/disabled status.

### Policy decision still needed

The existing permission vocabulary cannot express the entire #240 table:
technical inspection/waiver transitions require entry:write, which also permits
editing and admitting entries. Granting that broad permission to satisfy the
role's one task would grant forbidden powers. This implementation fails closed:
scrutineer cannot write. Entry messages use entry:write, allowing office to send
without changing event settings; saving message templates remains a setting. A follow-up must separate operation-level
permissions (e.g. entry:inspect) and enforce them throughout API,
Core and repositories, or explicitly approve broader access. Read-only artifact
generation remains available under entry:read; it produces downloads rather than
mutating sporting/business records. This is not yet full acceptance of #240.

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
  and case-folding. Existing memberships cannot be overwritten or reactivated via
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
