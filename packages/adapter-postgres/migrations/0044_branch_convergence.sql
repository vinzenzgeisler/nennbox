-- Cover feature-preview databases that used migration timestamps 0042–0044 before workbasket landed.
DO $workbasket_bootstrap$
BEGIN
  IF to_regclass('public.workbasket_configuration') IS NULL THEN
    EXECUTE $migration$
ALTER TABLE event_class ADD COLUMN allows_multiple_starts boolean NOT NULL DEFAULT false,
 ADD COLUMN min_displacement_cc integer, ADD COLUMN max_displacement_cc integer,
 ADD COLUMN min_year integer, ADD COLUMN max_year integer,
 ADD CONSTRAINT workbasket_displacement_bounds CHECK (min_displacement_cc >= 0 AND max_displacement_cc >= 0 AND min_displacement_cc <= max_displacement_cc),
 ADD CONSTRAINT workbasket_year_bounds CHECK (min_year >= 1 AND max_year >= 1 AND min_year <= max_year);
ALTER TABLE vehicle ADD COLUMN vin text;
ALTER TABLE registration_group ADD COLUMN license_valid_until date;
ALTER TABLE entry_document ADD COLUMN valid_until date;

CREATE TABLE workbasket_configuration (
 organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 scope_id uuid NOT NULL,
 event_id uuid,
 config jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
 PRIMARY KEY (organization_id, scope_id),
 FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE,
 CHECK (scope_id = coalesce(event_id,organization_id))
);
CREATE TABLE workbasket_cache (
 organization_id uuid NOT NULL,
 event_id uuid NOT NULL,
 dirty boolean NOT NULL DEFAULT true,
 tasks jsonb NOT NULL DEFAULT '[]',
 computed_at timestamptz,
 valid_until timestamptz,
 generation integer NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,event_id),
 FOREIGN KEY(organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE
);
CREATE FUNCTION invalidate_workbasket_event(org uuid, ev uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO workbasket_cache(organization_id,event_id) SELECT org,ev
 WHERE EXISTS(SELECT 1 FROM event WHERE organization_id=org AND id=ev)
 ON CONFLICT(organization_id,event_id) DO UPDATE SET dirty=true;
END $$;
CREATE FUNCTION invalidate_workbasket() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; org uuid; ev uuid; ref uuid;
BEGIN
 FOR r IN SELECT to_jsonb(OLD) WHERE TG_OP <> 'INSERT'
          UNION ALL SELECT to_jsonb(NEW) WHERE TG_OP <> 'DELETE'
 LOOP
  org := (r->>'organization_id')::uuid;
  IF TG_TABLE_NAME='organization' THEN
   org := (r->>'id')::uuid;
   FOR ev IN SELECT id FROM event WHERE organization_id=org LOOP
    PERFORM invalidate_workbasket_event(org,ev);
   END LOOP;
  ELSIF TG_TABLE_NAME='event' THEN
   PERFORM invalidate_workbasket_event(org,(r->>'id')::uuid);
  ELSIF TG_TABLE_NAME IN ('person','vehicle') THEN
   ref := (r->>'id')::uuid;
   FOR ev IN SELECT DISTINCT event_id FROM entry WHERE organization_id=org
    AND ((TG_TABLE_NAME='person' AND driver_person_id=ref) OR (TG_TABLE_NAME='vehicle' AND vehicle_id=ref))
   LOOP PERFORM invalidate_workbasket_event(org,ev); END LOOP;
  ELSIF TG_TABLE_NAME='invoice_payment' THEN
   SELECT event_id INTO ev FROM invoice WHERE organization_id=org AND id=(r->>'invoice_id')::uuid;
   IF ev IS NOT NULL THEN PERFORM invalidate_workbasket_event(org,ev); END IF;
  ELSIF TG_TABLE_NAME='workbasket_configuration' AND r->>'event_id' IS NULL THEN
   FOR ev IN SELECT id FROM event WHERE organization_id=org LOOP
    PERFORM invalidate_workbasket_event(org,ev);
   END LOOP;
  ELSE
   PERFORM invalidate_workbasket_event(org,(r->>'event_id')::uuid);
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organization','event','event_class','entry','registration_group','person','vehicle','invoice','invoice_payment','entry_document','event_entry_document_type','workbasket_configuration']
 LOOP EXECUTE format('CREATE TRIGGER workbasket_invalidate AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION invalidate_workbasket()',t);
 END LOOP;
END $$;

$migration$;
  END IF;
END $workbasket_bootstrap$;
DO $workbasket_log_bootstrap$
BEGIN
  IF to_regclass('public.workbasket_invalidation') IS NULL THEN
    EXECUTE $migration$
-- Append-only transactional signals: writers never acquire a shared event cache lock.
-- Readers drain only visible signals under their cache lock; later commits remain pending.
CREATE TABLE workbasket_invalidation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 event_id uuid NOT NULL,
 FOREIGN KEY(organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX workbasket_invalidation_event ON workbasket_invalidation(organization_id,event_id);
CREATE OR REPLACE FUNCTION invalidate_workbasket_event(org uuid, ev uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO workbasket_invalidation(organization_id,event_id) SELECT org,ev
 WHERE EXISTS(SELECT 1 FROM event WHERE organization_id=org AND id=ev);
END $$;
-- Existing caches used raw workflow keys. Force one category-aware rebuild after upgrade.
UPDATE workbasket_cache SET dirty=true;

$migration$;
  END IF;
END $workbasket_log_bootstrap$;
