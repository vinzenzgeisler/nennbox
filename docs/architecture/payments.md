# Online payment

Payment state stays in NENNBOX: the invoice and its append-only ledger (`invoice_payment`) decide what is paid. A payment provider is only the source of signed events and the executor of refunds. This page describes the port, the checkout lifecycle, the cancellation refund rule, and the interface a Cloud implementation (Stripe Connect) has to meet.

## Port

`PaymentProvider` lives in Core (`packages/core/src/payment-provider.ts`); `@nennbox/adapter-stripe` is the Community implementation.

| Call | Purpose |
| --- | --- |
| `createCheckoutSession` | Hosted checkout for the open balance of one invoice; returns id, URL and expiry. |
| `expireCheckoutSession` | Ends an unpaid checkout so its link stops working ("Zahlung abbrechen", replacing a checkout, cancelling a registration). Resolves `expired`, or `completed` when the payer already paid it; that session is never replaced. |
| `verifyWebhook` | Checks the signature and maps the notification to a `PaymentProviderEvent`. Throws on an invalid signature or incomplete content, returns `null` for an authentic event that carries nothing to apply (other type, SEPA debit that is still pending). |
| `refund` | Full or partial refund of one provider payment, idempotent by key. |

Every call that moves money carries `organizationId`. The domain model never names a provider account.

## Checkout lifecycle

```
POST …/invoices/:id/checkout            checkout_pending ──▶ paid
POST /public/driver-portal/payment/…                    ├─▶ failed
                                                        └─▶ expired
```

- The amount is always the open balance from the ledger, never from the request. The return URLs use the canonical origin, never the request host.
- Payment methods are the ones enabled for the event (organization default, overridden by the event, same merge as the registration form). No enabled method means no online payment: the form hides the option, the portal hides the button, the endpoint answers 400/503.
- An unpaid checkout is resumed ("später bezahlen") only while it still matches: same open amount, same set of methods as the event setting now, and not past its expiry. The session stores both when it is created; sessions from before that (NULL) never match.
- Anything else open is **ended at the provider first** (`expireCheckoutSession`), marked locally afterwards, and only then is the replacement created. Otherwise the old link would stay payable next to the new one and the invoice could be paid twice. If the provider reports one of them as already paid (`completed`) or the call fails, no second checkout is opened (HTTP 409 / 503) and the driver is told. A payment that still arrives twice is booked as it is; the admin detail then shows the overpayment with the way to refund it.
- The provider idempotency key contains the number of earlier sessions, so a replacement never receives the provider's cached, dead session. A double click sends the same key twice; the second request gets the same session and the session row is stored once (`ON CONFLICT DO NOTHING`).
- A registration whose entries are all withdrawn or rejected cannot be paid any more (404).
- "Zahlung abbrechen" ends every unpaid checkout the same way. A checkout that was paid in the meantime stays paid (409).
- State per session is stored in `payment_checkout_session`. A database trigger keeps the outcome independent of event order: `paid` is never left again, and `failed`/`expired` can still become `paid` when money arrives later.

## Webhook

`POST /webhooks/stripe`, authenticated by the provider signature only.

1. `verifyWebhook` rejects a missing or wrong signature (HTTP 400, logged without payload).
2. Community: the event's organization must be the single configured organization. Cloud: see "Connect" below.
3. The event id is stored first (`payment_provider_event`, unique per organization and provider). A replay stops there (`duplicate`). A second event for an already booked payment is also a duplicate.
4. A succeeded event books the received amount in the ledger (`method = online`, audit entry, invoice status derived from the ledger), queues the payment confirmation mail and updates the session named by the event. **Money that was really received is always booked.** If the amount differs from the open balance (for example a transfer arrived while the checkout was open) the payment is still recorded, the ledger reason names expected and received amount, the response carries `amountMismatch`, and a warning is logged; the organizer can refund the difference.
5. Unknown invoices, other currencies or cancelled invoices answer 404 and log a warning, so the provider keeps retrying and the case stays visible. Authentic but irrelevant events answer 200 (`ignored`).

Handled event types: `checkout.session.completed` (when paid), `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. A Checkout Session carries `organizationId` and `invoiceId` in its metadata, which is why session events are used instead of `payment_intent.succeeded`.

## Refunds

- Manual (admin entry detail): full or partial, with a reason, per provider payment, idempotent by a key the dialog keeps while it is open. The ledger writes a negative `online` entry and an audit event with the actor. Failures are shown in German; a refund that Stripe executed but the ledger could not record can be retried with the same key without refunding twice.
- Automatic, on cancellation: see below.

### Refund rule on cancellation

Configured per organization and overridable per event in the registration settings (`payments.refundPolicy`):

```json
{ "enabled": true, "tiers": [{ "daysBefore": 28, "percent": 100 }, { "daysBefore": 14, "percent": 50 }], "rejectedPercent": 100 }
```

- Disabled by default. A tier applies when the cancellation is at least `daysBefore` whole days before the start of the event day (UTC); the tier with the most days that still matches wins; no matching tier means 0 %.
- A withdrawal (driver or admin) follows the tiers. A rejection by the organizer refunds `rejectedPercent`, regardless of timing.
- The invoice belongs to a registration group, so the rule fires when **every** entry of the group is withdrawn or rejected. Cancelling one of several entries is refunded by hand.
- Only online payments are refunded automatically. Bank transfers are refunded by the organizer.
- The cancelling transaction locks the invoice, counts the entries that are still active and writes a `payment_refund_intent`. The lock matters: two cancellations of the last two entries run in separate transactions and would otherwise each see the other as still active, so no refund would be queued at all.
- After the commit the API ends all open checkouts of the invoice (nobody can pay afterwards), then takes the intent (`UPDATE … RETURNING`, status `processing`) and calls the provider with keys derived from the intent (`auto-refund:<intent>:<payment>`). The refund is recorded in the ledger as actor `system:refund-policy`.
- **The share is taken from what was paid**, not from what is left: `min(paid × percent − already refunded, still refundable)`, rounded down to whole cents. 100,00 paid, 50,00 refunded by hand and a rule of 50 % therefore refunds nothing more.
- A failure never undoes the cancellation. The intent becomes `failed` with a short reason (`provider_unavailable`, `ledger_rejected`, `intent_data_missing`) and the admin entry detail shows it with a pointer to the manual refund.
- **Retry:** an intent that stays `pending` or `processing` for longer than the retry delay (default 10 minutes, `PAYMENT_REFUND_RETRY_AFTER_MS` in the worker) is taken up again by the `payment_refund_retry` worker job (every five minutes, per organization, Community worker only for its own organization). The provider keys stay the same and the share is computed from what was already refunded, so a half-finished run cannot refund twice. `failed` intents with an unresolved reservation are retried with the same stored operation; other failed intents require office action.
- Recording a refund checks for an already recorded provider refund id only after it holds the invoice lock, so a parallel duplicate answers `duplicate` instead of failing on the unique key and turning a successful refund into `failed`.

## Secrets

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` come from the environment or, as `STRIPE_SECRET_KEY_FILE` / `STRIPE_WEBHOOK_SECRET_FILE`, from a file (Docker/systemd secrets). Setting both forms for one secret, an unreadable or empty file, or only one of the two secrets is a configuration error; none of them silently switches online payment off. API and worker read them the same way (`resolveStripeSecretFiles` in the Stripe adapter). Nothing is stored in the database; logs never contain keys or provider payloads.

## Stripe Connect (Cloud, private repository)

Connect is **not** implemented here; the Cloud edition provides another `PaymentProvider` behind the same port. Checked against the port:

- **Account per call.** `createCheckoutSession`, `expireCheckoutSession` and `refund` carry `organizationId`. A Connect adapter resolves the connected account of that organization (private store) and sets the `Stripe-Account` header per request. No port change is needed, and the domain model stays free of account ids.
- **Webhook attribution (event → account → organization).** Connect events arrive with the connected account in `event.account`. The Connect adapter must (1) verify the signature with the Connect endpoint secret, (2) map `event.account` to an organization through its own store, and (3) require that this organization equals the `organizationId` in the session metadata, throwing otherwise. It returns the event with that `organizationId` (and may fill the optional `accountId`). The single-account Community adapter refuses events that carry an account.
- **Per-organization capabilities.** Which methods work depends on the connected account; the adapter should drop or reject methods the account cannot use. The enabled list per event stays the upper bound.
- **No platform fee.** The request type has no fee field on purpose; adding one later is an additive change of `CheckoutSessionRequest`.
- **Onboarding** (account creation, status, disconnect) is Cloud-only and not part of the port.

## Review lifecycle guarantees

Checkout creation is serialized on the invoice row in PostgreSQL, including the provider call and session persistence. Parallel HTTP requests therefore see the committed session rather than opening a second one. The existing unique provider-payment constraint independently prevents double ledger booking across different webhook IDs.

`payments.checkoutLifetimeMinutes` is configurable in the organization registration configuration and overridable per event (30–1440 minutes, default **60 minutes**). Checkout sends the expiry to Stripe, which closes the checkout even if the driver never returns; its signed expiry event closes the local state. Elapsed sessions are never reused, even if the webhook is delayed; the next attempt reconciles them with the provider before replacement. This expiry governs unpaid hosted checkout, not an already submitted asynchronous SEPA debit, whose eventual outcome remains authoritative.

Cancellation and webhook settlement serialize on the invoice row. If settlement wins, cancellation sees the booked funds and queues the policy intent. If cancellation wins, later money is still recorded truthfully but marked **payment_after_cancellation** as a failed refund intent, visible in the office invoice detail with a manual-refund action. This applies even when the policy is disabled or a former refund intent was completed. No normal payment confirmation is sent for this case. A cancelled invoice remains cancelled after settlement/refund.


### Atomic refund operations and reactivation

Manual and automatic refunds reserve an operation in `payment_refund_reservation`
under the invoice row lock **before** calling the provider. The stored key and
amount remain unchanged on retry. Ledger booking completes the reservation in
the same transaction. Unresolved reservations count against the remaining funds;
when a cancellation rule applies, manual operations also share its gross target.
The claim snapshot is only a list of payments, never authority for an amount.

Acceptance changes lock the invoice before changing entry rows. Reactivation
invalidates old intents in that transaction. If a provider operation is still
reserved (including an uncertain response), reactivation answers HTTP 409
`Refund in progress; reconcile before reactivation` instead of silently resuming
participation. Do not delete an unresolved reservation to retry with a new key:
first reconcile its persisted operation with the provider and book the result.
The defensive automatic reservation check also refuses stale intents for active
groups, even when legacy data bypassed the normal transition.

Unpaid cancellation does not need a refund intent. Its pending checkout session
rows are durable closure work: the refund retry worker scans them per tenant,
checks that the group is still fully cancelled, and expires the links. A provider
outage leaves these rows pending for the next run. The API resolves the invoice
independently of refundable receipts and closes these links immediately too.


Failed automatic intents with unresolved reservations remain in the delayed retry
queue. Manual reservations persist their original actor and reason and are also
resumed by the worker, even after the dialog closes. A lost response or booking
failure therefore never requires a new key, nor silently abandons reserved funds.
Definitive provider rejection remains visible; uncertain reservations are never
released just because a request failed.

Stripe refund metadata contains a hash of the persisted operation key. Before
creating a refund, the adapter scans all refund pages for that payment and reuses
the matching operation. This survives Stripe's short-lived idempotency cache, so
a delayed worker cannot send the rule's amount twice after cache expiry.

Only an authoritative provider refund state `failed`/`canceled` raises
`RefundRejectedError`. That operation becomes `rejected` under the invoice lock,
releasing its reservation without creating a fictitious negative ledger entry.
Transport failures and unknown responses never release funds. Definitive rejection
therefore permits a new office operation or reactivation; ambiguous operations
continue to block reactivation until recovery settles their original key.
