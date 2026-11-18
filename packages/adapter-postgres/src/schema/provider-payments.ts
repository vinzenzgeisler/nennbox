import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organization.js';
import { invoices } from './billing.js';

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
    createdAt: timestamp('created_at', { withTimezone: true })
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
