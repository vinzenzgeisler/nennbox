import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
  check,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, events, eventClasses } from './organization.js';

export const startNumberRanges = pgTable(
  'start_number_range',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    classId: uuid('class_id'),
    rangeFrom: integer('range_from').notNull(),
    rangeTo: integer('range_to').notNull(),
    reservedNumbers: integer('reserved_numbers').array().notNull().default([]),
    assignmentMode: text('assignment_mode').notNull().default('driver_choice'),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'start_number_range_org_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.classId],
      foreignColumns: [
        eventClasses.organizationId,
        eventClasses.eventId,
        eventClasses.id,
      ],
      name: 'start_number_range_org_class_fk',
    }).onDelete('cascade'),
    index('start_number_range_event_idx').on(
      t.organizationId,
      t.eventId,
      t.classId,
    ),
    check(
      'start_number_range_values_check',
      sql`${t.rangeFrom} >= 0 and ${t.rangeTo} >= ${t.rangeFrom}`,
    ),
    check(
      'start_number_range_mode_check',
      sql`${t.assignmentMode} in ('driver_choice','organizer_assigned','automatic')`,
    ),
  ],
);

export const eventWaitlistSettings = pgTable(
  'event_waitlist_settings',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    automaticPromotion: boolean('automatic_promotion').notNull().default(false),
    confirmationHours: integer('confirmation_hours').notNull().default(48),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_waitlist_settings_org_event_fk',
    }).onDelete('cascade'),
    check(
      'event_waitlist_hours_check',
      sql`${t.confirmationHours} between 1 and 720`,
    ),
  ],
);
