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
