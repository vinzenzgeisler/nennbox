ALTER TABLE entry ADD COLUMN assigned_start_number text;

-- No configured range means the historical driver-choice default. With configured
-- ranges, confirm only values valid in a driver-choice or automatic range.
-- An organizer-assigned legacy value is ambiguous and remains only a wish.
UPDATE entry e SET assigned_start_number = e.requested_start_number
WHERE e.requested_start_number IS NOT NULL AND (
  NOT EXISTS (
    SELECT 1 FROM start_number_range r
    WHERE r.organization_id = e.organization_id AND r.event_id = e.event_id
      AND (r.class_id = e.class_id OR r.class_id IS NULL)
  )
  OR EXISTS (
    SELECT 1 FROM start_number_range r
    WHERE r.organization_id = e.organization_id AND r.event_id = e.event_id
      AND (r.class_id = e.class_id OR (
        r.class_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM start_number_range specific
          WHERE specific.organization_id = e.organization_id
            AND specific.event_id = e.event_id AND specific.class_id = e.class_id
        )
      ))
      AND r.assignment_mode IN ('driver_choice', 'automatic')
      AND CASE WHEN e.requested_start_number ~ '^[0-9]+$'
        THEN e.requested_start_number::numeric BETWEEN r.range_from AND r.range_to
          AND NOT (e.requested_start_number::numeric = ANY(r.reserved_numbers))
        ELSE false END
  )
);

CREATE UNIQUE INDEX entry_event_assigned_start_number_unique
ON entry (organization_id, event_id, assigned_start_number)
WHERE assigned_start_number IS NOT NULL AND deleted_at IS NULL AND acceptance_status <> 'withdrawn';

-- A shared claim namespace enforces wish/assignment conflicts even for concurrent
-- direct SQL writes: advisory locks plus snapshot-based trigger checks cannot.
-- This internal table is maintained exclusively by the entry trigger.
CREATE TABLE entry_start_number_claim (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  start_number text NOT NULL,
  entry_id uuid NOT NULL,
  CONSTRAINT entry_start_number_claim_entry_fk FOREIGN KEY (organization_id, event_id, entry_id)
    REFERENCES entry (organization_id, event_id, id) ON DELETE CASCADE,
  CONSTRAINT entry_start_number_claim_unique PRIMARY KEY (organization_id, event_id, start_number)
);
CREATE INDEX entry_start_number_claim_owner_idx ON entry_start_number_claim (entry_id);

INSERT INTO entry_start_number_claim (organization_id, event_id, start_number, entry_id)
SELECT DISTINCT e.organization_id, e.event_id, n.number, e.id
FROM entry e CROSS JOIN LATERAL (
  VALUES (e.requested_start_number), (e.assigned_start_number)
) n(number)
WHERE e.deleted_at IS NULL AND e.acceptance_status <> 'withdrawn' AND n.number IS NOT NULL;

CREATE FUNCTION sync_entry_start_number_claims() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM entry_start_number_claim WHERE entry_id = NEW.id;
  IF NEW.deleted_at IS NULL AND NEW.acceptance_status <> 'withdrawn' THEN
    INSERT INTO entry_start_number_claim (organization_id, event_id, start_number, entry_id)
    SELECT DISTINCT NEW.organization_id, NEW.event_id, n.number, NEW.id
    FROM (VALUES (NEW.requested_start_number), (NEW.assigned_start_number)) n(number)
    WHERE n.number IS NOT NULL ORDER BY n.number;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER entry_start_number_claims
AFTER INSERT OR UPDATE OF organization_id, event_id, requested_start_number, assigned_start_number, deleted_at, acceptance_status
ON entry FOR EACH ROW EXECUTE FUNCTION sync_entry_start_number_claims();
