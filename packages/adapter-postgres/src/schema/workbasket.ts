import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  timestamp,
  integer,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, events } from './organization.js';
import type { WorkbasketConfigOverrides, WorkbasketTask } from '@nennbox/core';

export const workbasketConfigurations = pgTable(
  'workbasket_configuration',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scopeId: uuid('scope_id').notNull(),
    eventId: uuid('event_id'),
    config: jsonb('config')
      .$type<WorkbasketConfigOverrides>()
      .notNull()
      .default({}),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.scopeId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete('cascade'),
    check(
      'workbasket_configuration_scope_check',
      sql`${t.scopeId}=coalesce(${t.eventId},${t.organizationId})`,
    ),
    check(
      'workbasket_configuration_object_check',
      sql`jsonb_typeof(${t.config})='object'`,
    ),
  ],
);

export const workbasketCache = pgTable(
  'workbasket_cache',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    dirty: boolean('dirty').notNull().default(true),
    tasks: jsonb('tasks')
      .$type<readonly WorkbasketTask[]>()
      .notNull()
      .default([]),
    computedAt: timestamp('computed_at', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    generation: integer('generation').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete('cascade'),
  ],
);
