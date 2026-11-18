CREATE TABLE registration_upload_cleanup (
  organization_id uuid NOT NULL,
  object_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_until timestamptz,
  PRIMARY KEY (organization_id, object_id)
);
CREATE INDEX registration_upload_cleanup_claim_idx
  ON registration_upload_cleanup (claimed_until, created_at);
