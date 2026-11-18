CREATE TABLE driver_portal_link (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL,
 registration_group_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,event_id,registration_group_id) REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE INDEX driver_portal_link_open_idx ON driver_portal_link(organization_id,token_hash) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE TABLE driver_portal_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL,
 registration_group_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,event_id,registration_group_id) REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE INDEX driver_portal_session_expiry_idx ON driver_portal_session(expires_at);
CREATE TABLE event_driver_portal_field (
 organization_id uuid NOT NULL, event_id uuid NOT NULL, field_key text NOT NULL,
 PRIMARY KEY (organization_id,event_id,field_key),
 FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE,
 CHECK (field_key IN ('phone','street','postalCode','city','emergencyContactName','emergencyContactPhone','licenseNumber'))
);
ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link'));
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link'));
