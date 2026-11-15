-- Replace event-scoped sequential codes with random, NENNBOX-wide unique codes.
-- gen_random_uuid() uses PostgreSQL's cryptographically secure random source.
DO $$
DECLARE
  entry_row record;
  candidate text;
BEGIN
  FOR entry_row IN SELECT id FROM entry ORDER BY created_at, id LOOP
    LOOP
      WITH bytes AS MATERIALIZED (
        SELECT position,
          get_byte(decode(md5(gen_random_uuid()::text), 'hex'), position - 1) AS value
        FROM generate_series(1, 5) AS positions(position)
      )
      SELECT string_agg(
        CASE WHEN value < 240 THEN
          substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', (value % 30) + 1, 1)
        END, '' ORDER BY position
      ) INTO candidate FROM bytes;
      EXIT WHEN length(candidate) = 5 AND NOT EXISTS (
        SELECT 1 FROM entry WHERE orga_code = candidate
      );
    END LOOP;
    UPDATE entry SET orga_code = candidate WHERE id = entry_row.id;
  END LOOP;
END $$;

ALTER TABLE entry DROP CONSTRAINT IF EXISTS entry_org_event_orga_code_unique;
ALTER TABLE entry ADD CONSTRAINT entry_orga_code_unique UNIQUE (orga_code);
DROP TABLE IF EXISTS event_orga_code_sequence;
DROP INDEX IF EXISTS entry_orga_code_search_idx;
CREATE INDEX entry_orga_code_search_idx ON entry (organization_id, orga_code);
