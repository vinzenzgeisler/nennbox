ALTER TABLE entry ADD COLUMN waitlist_position integer;
ALTER TABLE entry ADD COLUMN waitlist_confirmation_deadline timestamptz;
ALTER TABLE entry ADD COLUMN waitlist_offer_sent_at timestamptz;
ALTER TABLE entry ADD CONSTRAINT entry_waitlist_position_check CHECK (waitlist_position IS NULL OR waitlist_position > 0);

CREATE TABLE event_waitlist_settings (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  automatic_promotion boolean NOT NULL DEFAULT false,
  confirmation_hours integer NOT NULL DEFAULT 48 CHECK (confirmation_hours BETWEEN 1 AND 720),
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id) REFERENCES event(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE start_number_range (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  class_id uuid,
  range_from integer NOT NULL CHECK (range_from >= 0),
  range_to integer NOT NULL CHECK (range_to >= range_from),
  reserved_numbers integer[] NOT NULL DEFAULT '{}',
  assignment_mode text NOT NULL DEFAULT 'driver_choice' CHECK (assignment_mode IN ('driver_choice','organizer_assigned','automatic')),
  FOREIGN KEY (organization_id, event_id) REFERENCES event(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, class_id) REFERENCES event_class(organization_id, event_id, id) ON DELETE CASCADE,
  CHECK (array_position(reserved_numbers, NULL) IS NULL)
);
CREATE INDEX start_number_range_event_idx ON start_number_range (organization_id, event_id, class_id);
CREATE INDEX entry_waitlist_order_idx ON entry (organization_id, event_id, class_id, waitlist_position) WHERE acceptance_status = 'waitlisted' AND deleted_at IS NULL;
