# Online payment

Payment state stays in NENNBOX: the invoice and its append-only ledger (`invoice_payment`) decide what is paid. A payment provider is only the source of signed events and the executor of refunds. This page describes the port, the checkout lifecycle, the cancellation refund rule, and the interface a Cloud implementation (Stripe Connect) has to meet.

## Port

`PaymentProvider` lives in Core (`packages/core/src/payment-provider.ts`); `@nennbox/adapter-stripe` is the Community implementation.

| Call | Purpose |
| --- | --- |
| `createCheckoutSession` | Hosted checkout for the open balance of one invoice; returns id, URL and expiry. |
| `expireCheckoutSession` | "Zahlung abbrechen": ends an unpaid checkout so its link stops working. |
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
- One unpaid checkout per invoice is resumed instead of duplicated ("später bezahlen"): the portal and the confirmation mail link to the portal, where "Zahlung fortsetzen" returns the open session. A session created for an outdated amount is replaced. The provider idempotency key contains the number of earlier sessions, so a replacement never receives the provider's cached, dead session.
- "Zahlung abbrechen" expires the session at the provider first and marks it locally only after that worked. A checkout that was paid in the meantime stays paid (the provider refuses to expire it and the call reports an error).
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
- The cancelling transaction only writes a `payment_refund_intent`. After it committed, the API calls the provider with keys derived from the intent (`auto-refund:<intent>:<payment>`) and records the refund in the ledger as actor `system:refund-policy`. The share is rounded down to whole cents.
- A failure never undoes the cancellation. The intent becomes `failed` with a short reason (`provider_unavailable`, `ledger_rejected`) and the admin entry detail shows it with a pointer to the manual refund.

## Secrets

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` come from the environment or, as `STRIPE_SECRET_KEY_FILE` / `STRIPE_WEBHOOK_SECRET_FILE`, from a file (Docker/systemd secrets). Setting both forms for one secret, or only one of the two secrets, is a configuration error. Nothing is stored in the database; logs never contain keys or provider payloads.

## Stripe Connect (Cloud, private repository)

Connect is **not** implemented here; the Cloud edition provides another `PaymentProvider` behind the same port. Checked against the port:

- **Account per call.** `createCheckoutSession`, `expireCheckoutSession` and `refund` carry `organizationId`. A Connect adapter resolves the connected account of that organization (private store) and sets the `Stripe-Account` header per request. No port change is needed, and the domain model stays free of account ids.
- **Webhook attribution (event → account → organization).** Connect events arrive with the connected account in `event.account`. The Connect adapter must (1) verify the signature with the Connect endpoint secret, (2) map `event.account` to an organization through its own store, and (3) require that this organization equals the `organizationId` in the session metadata, throwing otherwise. It returns the event with that `organizationId` (and may fill the optional `accountId`). The single-account Community adapter refuses events that carry an account.
- **Per-organization capabilities.** Which methods work depends on the connected account; the adapter should drop or reject methods the account cannot use. The enabled list per event stays the upper bound.
- **No platform fee.** The request type has no fee field on purpose; adding one later is an additive change of `CheckoutSessionRequest`.
- **Onboarding** (account creation, status, disconnect) is Cloud-only and not part of the port.
