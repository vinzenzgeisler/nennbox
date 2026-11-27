-- Hand-written: functions, triggers and data backfills are not expressible in
-- the drizzle schema. Only the column and index definitions mirror schema/entries.ts
-- (the 0053 snapshot is generated from it). Journal entry and snapshot were
-- created with drizzle-kit.
-- One resolver for queries and the index projection; never fall back to raw keys.
CREATE FUNCTION entry_status_category(org uuid, revision uuid, status_key text, fail_unknown boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE category text;
BEGIN
 SELECT s->>'category' INTO category
 FROM entry_workflow_revision r, jsonb_array_elements(r.workflow->'statuses') s
 WHERE r.organization_id=org AND r.id=revision AND coalesce(s->>'id',s->>'key')=status_key;
 IF category IS NULL AND fail_unknown THEN
  RAISE EXCEPTION 'Unknown entry status: %', status_key;
 END IF;
 RETURN category;
END $$;
--> statement-breakpoint
-- Withdrawn and rejected entries hold no place (class seat or start number).
-- Mirror of releasesPlace() in @nennbox/core; unknown (NULL) stays reserved.
CREATE FUNCTION entry_category_holds_place(category text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT category IS DISTINCT FROM 'withdrawn' AND category IS DISTINCT FROM 'rejected'
$$;
--> statement-breakpoint
-- Preflight: the new unique indexes and claims treat entries by pinned category.
-- Legacy data that only coexisted because of raw-key matching would fail
-- CREATE UNIQUE INDEX with an opaque error; name the colliding entries instead.
DO $$
DECLARE conflict record;
BEGIN
 SELECT c.start_number, c.event_id, string_agg(c.orga_code || ' (' || c.entry_id || ')', ', ' ORDER BY c.orga_code) AS entries INTO conflict
 FROM (
  SELECT DISTINCT e.organization_id, e.event_id, e.id AS entry_id, e.orga_code, n.number AS start_number
  FROM entry e CROSS JOIN LATERAL (VALUES(e.requested_start_number),(e.assigned_start_number)) n(number)
  WHERE e.deleted_at IS NULL AND n.number IS NOT NULL
   AND entry_category_holds_place(entry_status_category(e.organization_id,e.workflow_revision_id,e.acceptance_status,false))
 ) c
 GROUP BY c.organization_id, c.event_id, c.start_number
 HAVING count(*) > 1
 ORDER BY c.event_id, c.start_number LIMIT 1;
 IF FOUND THEN
  RAISE EXCEPTION 'Migration 0053 blocked: start number % of event % is held by several entries: %. Withdraw, reject or renumber all but one of them (see docs/architecture/entry-status-categories.md, "Upgrade preflight"), then rerun the migration.', conflict.start_number, conflict.event_id, conflict.entries;
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE entry ADD COLUMN acceptance_category text;
--> statement-breakpoint
-- The projection is only for partial indexes (which cannot query revisions).
-- Unknown legacy data stays conservatively reserved; decision queries raise.
CREATE FUNCTION project_entry_status_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.acceptance_category := entry_status_category(NEW.organization_id,NEW.workflow_revision_id,NEW.acceptance_status,false);
 RETURN NEW;
END $$;
--> statement-breakpoint
-- Alphabetically after entry_pin_workflow_revision; refresh even for direct SQL writes.
CREATE TRIGGER entry_project_status_category BEFORE INSERT OR UPDATE ON entry
FOR EACH ROW EXECUTE FUNCTION project_entry_status_category();
--> statement-breakpoint
UPDATE entry SET acceptance_category=entry_status_category(organization_id,workflow_revision_id,acceptance_status,false);
--> statement-breakpoint
DROP INDEX entry_event_assigned_start_number_unique;
--> statement-breakpoint
DROP INDEX entry_event_requested_start_number_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX entry_event_assigned_start_number_unique ON entry(organization_id,event_id,assigned_start_number)
WHERE assigned_start_number IS NOT NULL AND deleted_at IS NULL AND entry_category_holds_place(acceptance_category);
--> statement-breakpoint
CREATE UNIQUE INDEX entry_event_requested_start_number_unique ON entry(organization_id,event_id,requested_start_number)
WHERE requested_start_number IS NOT NULL AND deleted_at IS NULL AND entry_category_holds_place(acceptance_category);
--> statement-breakpoint
DROP INDEX entry_waitlist_order_idx;
--> statement-breakpoint
CREATE INDEX entry_waitlist_order_idx ON entry(organization_id,event_id,class_id,waitlist_position)
WHERE acceptance_category='waitlisted' AND deleted_at IS NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_entry_start_number_claims() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM entry_start_number_claim WHERE organization_id=NEW.organization_id AND entry_id=NEW.id;
 IF NEW.deleted_at IS NULL AND entry_category_holds_place(NEW.acceptance_category) THEN
  INSERT INTO entry_start_number_claim(organization_id,event_id,start_number,entry_id)
  SELECT DISTINCT NEW.organization_id,NEW.event_id,n.number,NEW.id
  FROM (VALUES(NEW.requested_start_number),(NEW.assigned_start_number)) n(number)
  WHERE n.number IS NOT NULL ORDER BY n.number;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER entry_start_number_claims ON entry;
--> statement-breakpoint
CREATE TRIGGER entry_start_number_claims AFTER INSERT OR UPDATE OF organization_id,event_id,requested_start_number,assigned_start_number,deleted_at,acceptance_status,workflow_revision_id
ON entry FOR EACH ROW EXECUTE FUNCTION sync_entry_start_number_claims();
--> statement-breakpoint
DELETE FROM entry_start_number_claim c USING entry e
WHERE c.organization_id=e.organization_id AND c.entry_id=e.id AND NOT entry_category_holds_place(e.acceptance_category);
--> statement-breakpoint
-- Backfill claims omitted by the old raw-key predicate (e.g. an accepted
-- custom status whose id is literally withdrawn). Conflicts must fail loudly.
INSERT INTO entry_start_number_claim(organization_id,event_id,start_number,entry_id)
SELECT DISTINCT e.organization_id,e.event_id,n.number,e.id
FROM entry e CROSS JOIN LATERAL (VALUES(e.requested_start_number),(e.assigned_start_number)) n(number)
WHERE e.deleted_at IS NULL AND entry_category_holds_place(e.acceptance_category) AND n.number IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM entry_start_number_claim c WHERE c.organization_id=e.organization_id
 AND c.event_id=e.event_id AND c.start_number=n.number AND c.entry_id=e.id);
--> statement-breakpoint
-- Keep each writer's own signal. Remove only visible surplus signals for the
-- same tenant/event, never wait for other writers or a reader's locked rows.
-- Concurrent in-flight writers may temporarily exceed 256; subsequent writes
-- prune the surplus. No shared event/cache lock and no table-wide lock.
CREATE OR REPLACE FUNCTION invalidate_workbasket_event(org uuid, ev uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE signal uuid;
BEGIN
 INSERT INTO workbasket_invalidation(organization_id,event_id)
 SELECT org,ev WHERE EXISTS(SELECT 1 FROM event WHERE organization_id=org AND id=ev)
 RETURNING id INTO signal;
 IF signal IS NULL THEN RETURN; END IF;
 DELETE FROM workbasket_invalidation WHERE id IN (
  SELECT i.id FROM workbasket_invalidation i
  WHERE i.organization_id=org AND i.event_id=ev AND i.id IN (
   SELECT surplus.id FROM workbasket_invalidation surplus
   WHERE surplus.organization_id=org AND surplus.event_id=ev AND surplus.id<>signal
   ORDER BY surplus.id OFFSET 255
  ) FOR UPDATE SKIP LOCKED
 );
END $$;
