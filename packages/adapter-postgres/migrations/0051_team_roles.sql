-- Existing Administrator identifiers remain 'admin'; legacy 'member' becomes
-- 'viewer' (Nur lesen), deliberately granting read access but never write access.
ALTER TABLE organization_membership DROP CONSTRAINT organization_membership_role_check;
UPDATE organization_membership SET role = 'viewer' WHERE role = 'member';
ALTER TABLE organization_membership ADD CONSTRAINT organization_membership_role_check
  CHECK (role IN ('admin','office','cashier','scrutineer','viewer'));
CREATE TABLE team_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CONSTRAINT team_invitation_role_check CHECK (role IN ('admin','office','cashier','scrutineer','viewer')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_invitation_org_idx ON team_invitation (organization_id);
CREATE TABLE team_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  action text NOT NULL,
  target_id uuid NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_history_org_idx ON team_history (organization_id);
ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check
  CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link','payment-received','team-invitation'));
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check
  CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link','payment-received','team-invitation'));
