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
      .where(sql`${t.status} in ('pending','done')`),
    check(
      'payment_refund_intent_trigger_check',
      sql`${t.trigger} in ('withdrawn','rejected')`,
    ),
    check(
      'payment_refund_intent_status_check',
      sql`${t.status} in ('pending','done','failed','skipped')`,
    ),
  ],
);
