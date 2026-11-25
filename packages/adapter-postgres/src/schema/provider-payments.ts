import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  foreignKey,
  check,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organization.js';
import { invoices } from './billing.js';
import { entries } from './entries.js';

export const checkoutSessions = pgTable(
  'payment_checkout_session',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    provider: text('provider').notNull(),
    providerSessionId: text('provider_session_id').notNull(),
    url: text('url').notNull(),
    status: text('status').notNull().default('checkout_pending'),
    amountCents: integer('amount_cents'),
    paymentMethods: text('payment_methods').array(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('payment_checkout_org_provider_session_unique').on(
      t.organizationId,
      t.provider,
      t.providerSessionId,
    ),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
      name: 'payment_checkout_invoice_fk',
    }).onDelete('cascade'),
  ],
);

export const paymentProviderEvents = pgTable(
  'payment_provider_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    outcome: text('outcome').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    providerPaymentId: text('provider_payment_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('payment_provider_event_org_event_unique').on(
      t.organizationId,
      t.provider,
      t.providerEventId,
    ),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
      name: 'payment_provider_event_invoice_fk',
    }).onDelete('cascade'),
    check(
      'payment_provider_event_outcome_check',
      sql`${t.outcome} in ('succeeded','failed','expired')`,
    ),
  ],
);

/** Automatic refund after a cancellation; failures stay visible instead of being retried silently. */
export const paymentRefundIntents = pgTable(
  'payment_refund_intent',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull().default('pending'),
    percent: integer('percent'),
    refundedCents: integer('refunded_cents').notNull().default(0),
    failure: text('failure'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
      name: 'payment_refund_intent_invoice_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.entryId],
      foreignColumns: [entries.organizationId, entries.id],
      name: 'payment_refund_intent_entry_fk',
    }).onDelete('cascade'),
    uniqueIndex('payment_refund_intent_open_unique')
      .on(t.organizationId, t.invoiceId)
      .where(sql`${t.status} in ('pending','processing','done')`),
    check(
      'payment_refund_intent_trigger_check',
      sql`${t.trigger} in ('withdrawn','rejected','late_payment')`,
    ),
    check(
      'payment_refund_intent_status_check',
      sql`${t.status} in ('pending','processing','done','failed','skipped','superseded')`,
    ),
  ],
);

/**
 * A refund reserved under the invoice lock before the provider is called. It
 * keeps the amount and idempotency key stable across retries and counts against
 * what can still be refunded until the ledger entry exists.
 */
export const paymentRefundReservations = pgTable(
  'payment_refund_reservation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    source: text('source').notNull(),
    actor: text('actor').notNull().default('system:refund-recovery'),
    reason: text('reason').notNull().default('Refund recovery'),
    intentId: uuid('intent_id').references(() => paymentRefundIntents.id, {
      onDelete: 'cascade',
    }),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('reserved'),
    providerRefundId: text('provider_refund_id'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    needsReviewAt: timestamp('needs_review_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    resolvedReason: text('resolved_reason'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
      name: 'payment_refund_reservation_invoice_fk',
    }).onDelete('cascade'),
    unique('payment_refund_reservation_key_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    check(
      'payment_refund_reservation_source_check',
      sql`${t.source} in ('manual','automatic')`,
    ),
    check(
      'payment_refund_reservation_status_check',
      sql`${t.status} in ('reserved','completed','rejected','abandoned')`,
    ),
  ],
);
