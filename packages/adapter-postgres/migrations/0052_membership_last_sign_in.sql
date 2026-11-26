-- No historical login time can be inferred from membership updated_at.
-- Existing memberships intentionally start with NULL; login completion sets it.
ALTER TABLE "organization_membership" ADD COLUMN "last_signed_in_at" timestamp with time zone;
