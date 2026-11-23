import { sql, type SQL } from 'drizzle-orm';
import { entries } from './schema/entries.js';

/** `or(...)` that always yields a condition, so callers need no non-null assertion. */
export function anyOf(...conditions: [SQL, ...SQL[]]): SQL {
  return sql`(${sql.join(conditions, sql` or `)})`;
}

/** Entries lacking an uploaded or reviewed document of a required, enabled type; the overview count and the list filter share it. */
export const missingRequiredDocuments = (): SQL => sql`exists (
  select 1
  from event_entry_document_type required_type
  where required_type.organization_id = ${entries.organizationId}
    and required_type.event_id = ${entries.eventId}
    and required_type.enabled = true
    and required_type.required = true
    and not exists (
      select 1
      from entry_document submitted_document
      where submitted_document.organization_id = ${entries.organizationId}
        and submitted_document.event_id = ${entries.eventId}
        and submitted_document.entry_id = ${entries.id}
        and submitted_document.type_key = required_type.key
        and submitted_document.status in ('uploaded', 'reviewed')
    )
)`;
