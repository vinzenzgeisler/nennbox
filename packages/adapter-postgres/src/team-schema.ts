import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './schema/organization.js';

export const teamInvitations = pgTable(
  'team_invitation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'team_invitation_role_check',
      sql`${t.role} in ('admin','office','cashier','scrutineer','viewer')`,
    ),
    index('team_invitation_org_idx').on(t.organizationId),
  ],
);
export const teamHistory = pgTable(
  'team_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorIssuer: text('actor_issuer').notNull(),
    actorSubject: text('actor_subject').notNull(),
    action: text('action').notNull(),
    targetId: uuid('target_id').notNull(),
    details: jsonb('details').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('team_history_org_idx').on(t.organizationId)],
);
