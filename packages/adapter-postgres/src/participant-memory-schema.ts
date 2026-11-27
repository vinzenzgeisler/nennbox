import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  boolean,
  timestamp,
  check,
  index,
  primaryKey,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './schema/organization.js';

const organizationColumn = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const capturedAt = () =>
  timestamp('captured_at', { withTimezone: true }).notNull().defaultNow();

/** Organization switch and retention. No row means: off. */
export const participantMemorySettings = pgTable(
  'participant_memory_setting',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    retentionDays: integer('retention_days'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByIssuer: text('updated_by_issuer'),
    updatedBySubject: text('updated_by_subject'),
  },
  (t) => [
    check(
      'participant_memory_setting_retention_check',
      sql`${t.retentionDays} is null or ${t.retentionDays} > 0`,
    ),
  ],
);

/** Consent log: one row per grant; revocation closes the row, it is never rewritten. */
export const participantMemoryConsents = pgTable(
  'participant_memory_consent',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: organizationColumn(),
    /** Cleartext only while the consent is active; closing it removes the address, the keyed hash stays as proof. */
    email: text('email'),
    /** Organization-bound HMAC of the address (same key as the invitation tokens). */
    emailHash: text('email_hash'),
    wordingVersion: text('wording_version').notNull(),
    wordingHash: text('wording_hash').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [
    uniqueIndex('participant_memory_consent_active_unique')
      .on(t.organizationId, t.email)
      .where(sql`${t.revokedAt} is null`),
    index('participant_memory_consent_org_email_idx').on(
      t.organizationId,
      t.email,
    ),
    check(
      'participant_memory_consent_revoked_check',
      sql`(${t.revokedAt} is null and ${t.revokedReason} is null) or (${t.revokedAt} is not null and ${t.revokedReason} in ('withdrawn','deleted','disabled','expired','superseded','erased'))`,
    ),
    check(
      'participant_memory_consent_address_check',
      sql`(${t.revokedAt} is null and ${t.email} is not null) or (${t.revokedAt} is not null and ${t.email} is null)`,
    ),
    index('participant_memory_consent_hash_idx').on(
      t.organizationId,
      t.emailHash,
    ),
  ],
);

export const participantMemoryProfiles = pgTable(
  'participant_memory_profile',
  {
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: date('date_of_birth'),
    country: text('country'),
    phone: text('phone'),
    street: text('street'),
    postalCode: text('postal_code'),
    city: text('city'),
    bloodGroup: text('blood_group'),
    licenseNumber: text('license_number'),
    licenseValidUntil: date('license_valid_until'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    sourceEventName: text('source_event_name').notNull(),
    sourceEventStartsOn: date('source_event_starts_on').notNull(),
    capturedAt: capturedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.email] }),
    index('participant_memory_profile_captured_idx').on(
      t.organizationId,
      t.capturedAt,
    ),
  ],
);

export const participantMemoryVehicles = pgTable(
  'participant_memory_vehicle',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    fingerprint: text('fingerprint').notNull(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    year: integer('year'),
    registration: text('registration'),
    vin: text('vin'),
    vehicleType: text('vehicle_type'),
    displacementCc: integer('displacement_cc'),
    cylinders: integer('cylinders'),
    transponderNumber: text('transponder_number'),
    vehiclePassNumber: text('vehicle_pass_number'),
    ownerName: text('owner_name'),
    capturedAt: capturedAt(),
  },
  (t) => [
    unique('participant_memory_vehicle_unique').on(
      t.organizationId,
      t.email,
      t.fingerprint,
    ),
    index('participant_memory_vehicle_captured_idx').on(
      t.organizationId,
      t.capturedAt,
    ),
  ],
);

/** The co-driver as a reference only: name and e-mail, nothing else of a person who gave no consent. */
export const participantMemoryPassengers = pgTable(
  'participant_memory_passenger',
  {
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    passengerEmail: text('passenger_email'),
    capturedAt: capturedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.email] }),
    index('participant_memory_passenger_captured_idx').on(
      t.organizationId,
      t.capturedAt,
    ),
  ],
);

/** Reference to an uploaded document; the file itself stays in object storage under its entry. */
export const participantMemoryDocuments = pgTable(
  'participant_memory_document',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    typeKey: text('type_key').notNull(),
    typeName: text('type_name').notNull(),
    objectId: uuid('object_id').notNull(),
    validUntil: date('valid_until').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    capturedAt: capturedAt(),
  },
  (t) => [
    unique('participant_memory_document_unique').on(
      t.organizationId,
      t.email,
      t.typeKey,
      t.objectId,
    ),
    index('participant_memory_document_captured_idx').on(
      t.organizationId,
      t.capturedAt,
    ),
  ],
);

/** Magic links, delete links and short sessions. Only the SHA-256 of a token is stored. */
export const participantMemoryAccess = pgTable(
  'participant_memory_access',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('participant_memory_access_org_email_idx').on(
      t.organizationId,
      t.email,
    ),
    index('participant_memory_access_expires_idx').on(
      t.organizationId,
      t.expiresAt,
    ),
    check(
      'participant_memory_access_purpose_check',
      sql`${t.purpose} in ('access','delete','session')`,
    ),
    check(
      'participant_memory_access_hash_check',
      sql`${t.tokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

/**
 * Link requests wait here, so the public answer never depends on what this club knows:
 * the request path writes exactly one row, the worker decides and mails. Rows live seconds.
 */
export const participantMemoryRequests = pgTable(
  'participant_memory_request',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    purpose: text('purpose').notNull(),
    locale: text('locale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('participant_memory_request_unique').on(
      t.organizationId,
      t.email,
      t.purpose,
    ),
    index('participant_memory_request_created_idx').on(t.createdAt),
    check(
      'participant_memory_request_purpose_check',
      sql`${t.purpose} in ('access','delete')`,
    ),
    check(
      'participant_memory_request_locale_check',
      sql`${t.locale} in ('de','en')`,
    ),
  ],
);

/** Who erased whose memory and when. The address appears only as organization-bound hash. */
export const participantMemoryAudit = pgTable(
  'participant_memory_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: organizationColumn(),
    action: text('action').notNull(),
    emailHash: text('email_hash').notNull(),
    actorIssuer: text('actor_issuer').notNull(),
    actorSubject: text('actor_subject').notNull(),
    removedRows: integer('removed_rows').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('participant_memory_audit_org_idx').on(
      t.organizationId,
      t.occurredAt,
    ),
    check(
      'participant_memory_audit_action_check',
      sql`${t.action} in ('erased')`,
    ),
  ],
);
