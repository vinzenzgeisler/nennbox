import { sql } from 'drizzle-orm';
import type { RequestContext, WorkbasketSnapshot } from '@nennbox/core';
import type { Database } from './database.js';

/** Tenant predicates are repeated on every relation, including correlated lookups. */
export async function loadWorkbasketSnapshot(
  db: Database,
  ctx: RequestContext,
  eventId: string,
): Promise<WorkbasketSnapshot> {
  const org = ctx.organizationId;
  const event = (
    await db.execute(sql`
    SELECT e.starts_on::text AS "eventDate",
      (e.registration_closes_at AT TIME ZONE o.timezone)::date::text AS "closingDate",
      (now() AT TIME ZONE o.timezone)::date::text AS today, now()::text AS now
    FROM event e JOIN organization o ON o.id=e.organization_id
    WHERE e.organization_id=${org} AND e.id=${eventId}
  `)
  ).rows[0]!;
  const classes = (
    await db.execute(sql`
    SELECT id, name, max_participants AS "maxParticipants",
      allows_multiple_starts AS "allowsMultipleStarts",
      min_displacement_cc AS "minDisplacementCc", max_displacement_cc AS "maxDisplacementCc",
      min_year AS "minYear", max_year AS "maxYear"
    FROM event_class WHERE organization_id=${org} AND event_id=${eventId}
    ORDER BY id
  `)
  ).rows;
  const entries = (
    await db.execute(sql`
    SELECT e.id,e.orga_code AS "organizationCode",e.class_id AS "classId",to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
      (e.created_at AT TIME ZONE o.timezone)::date::text AS "createdOn",
      (SELECT s->>'category' FROM jsonb_array_elements(w.workflow->'statuses') s
       WHERE coalesce(s->>'id',s->>'key')=e.acceptance_status) AS status,
      e.acceptance_status AS "statusKey",p.first_name AS "firstName",p.last_name AS "lastName",
      p.date_of_birth::text AS "dateOfBirth",coalesce(g.contact_email,p.email) AS email,
      e.vehicle_id AS "vehicleId",v.vin,v.registration,v.displacement_cc AS "displacementCc",
      v.year,g.guardian_name AS "guardianName",g.license_valid_until::text AS "licenseValidUntil",
      coalesce(e.assigned_start_number,e.requested_start_number) AS "startNumber",
      e.waitlist_position AS "waitlistPosition",
      e.waitlist_offer_sent_at::text AS "waitlistOfferSentAt",
      e.waitlist_confirmation_deadline::text AS "waitlistOfferedUntil",
      ARRAY(SELECT t.name FROM event_entry_document_type t
        WHERE t.organization_id=e.organization_id AND t.event_id=e.event_id AND t.enabled AND t.required
        AND coalesce((SELECT d.status FROM entry_document d WHERE d.organization_id=e.organization_id
          AND d.event_id=e.event_id AND d.entry_id=e.id AND d.type_key=t.key
          ORDER BY d.uploaded_at DESC,d.id DESC LIMIT 1),'missing') NOT IN ('uploaded','reviewed')
        ORDER BY t.key) AS "missingDocumentNames",
      coalesce((SELECT jsonb_agg(jsonb_build_object('name',t.name,'validUntil',d.valid_until::text) ORDER BY t.key)
        FROM entry_document d JOIN event_entry_document_type t ON t.organization_id=d.organization_id
          AND t.event_id=d.event_id AND t.key=d.type_key
        WHERE d.organization_id=e.organization_id AND d.event_id=e.event_id AND d.entry_id=e.id
          AND d.valid_until IS NOT NULL AND d.status<>'rejected'
          AND d.id=(SELECT latest.id FROM entry_document latest WHERE latest.organization_id=d.organization_id
            AND latest.entry_id=d.entry_id AND latest.type_key=d.type_key
            ORDER BY latest.uploaded_at DESC,latest.id DESC LIMIT 1)), '[]'::jsonb) AS "expiringDocuments",
      NOT EXISTS (
        SELECT 1 FROM event_entry_document_type t
        WHERE t.organization_id=e.organization_id AND t.event_id=e.event_id AND t.enabled AND t.required
        AND coalesce((SELECT d.status FROM entry_document d WHERE d.organization_id=e.organization_id
          AND d.event_id=e.event_id AND d.entry_id=e.id AND d.type_key=t.key
          ORDER BY d.uploaded_at DESC,d.id DESC LIMIT 1),'missing') NOT IN ('uploaded','reviewed')
      ) AS "documentsComplete",
      ARRAY(SELECT d.valid_until::text FROM entry_document d
        WHERE d.organization_id=e.organization_id AND d.event_id=e.event_id AND d.entry_id=e.id
        AND d.valid_until IS NOT NULL AND d.status<>'rejected'
        AND d.id=(SELECT latest.id FROM entry_document latest WHERE latest.organization_id=d.organization_id
          AND latest.entry_id=d.entry_id AND latest.type_key=d.type_key
          ORDER BY latest.uploaded_at DESC,latest.id DESC LIMIT 1)) AS "documentValidUntil",
      coalesce(i.status='paid',false) AS paid
    FROM entry e
    JOIN organization o ON o.id=e.organization_id
    JOIN entry_workflow_revision w ON w.organization_id=e.organization_id AND w.id=e.workflow_revision_id
    JOIN person p ON p.organization_id=e.organization_id AND p.id=e.driver_person_id
    JOIN vehicle v ON v.organization_id=e.organization_id AND v.id=e.vehicle_id
    JOIN registration_group g ON g.organization_id=e.organization_id AND g.event_id=e.event_id AND g.id=e.registration_group_id
    LEFT JOIN invoice i ON i.organization_id=e.organization_id AND i.event_id=e.event_id AND i.registration_group_id=e.registration_group_id
    WHERE e.organization_id=${org} AND e.event_id=${eventId} AND e.deleted_at IS NULL
    ORDER BY e.id
  `)
  ).rows;
  for (const entry of entries)
    if (!entry.status)
      throw new Error(`Unknown entry status: ${entry.statusKey}`);
  return { ...event, classes, entries } as unknown as WorkbasketSnapshot;
}
