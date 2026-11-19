import {
  pgTable,
  uuid,
  text,
  timestamp,
  foreignKey,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { registrationGroups } from './entries.js';
import { events } from './organization.js';

const accessColumns = () => ({
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  eventId: uuid('event_id').notNull(),
  registrationGroupId: uuid('registration_group_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const driverPortalLinks = pgTable(
  'driver_portal_link',
  {
    ...accessColumns(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
    }).onDelete('cascade'),
  ],
);
export const driverPortalSessions = pgTable(
  'driver_portal_session',
  accessColumns(),
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
    }).onDelete('cascade'),
  ],
);
export const eventDriverPortalFields = pgTable(
  'event_driver_portal_field',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    fieldKey: text('field_key').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId, t.fieldKey] }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete('cascade'),
    check(
      'event_driver_portal_field_check',
      sql`${t.fieldKey} in ('phone','street','postalCode','city','emergencyContactName','emergencyContactPhone','licenseNumber')`,
    ),
  ],
);
