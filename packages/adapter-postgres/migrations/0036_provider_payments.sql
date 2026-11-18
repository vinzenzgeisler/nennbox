ALTER TABLE invoice_payment ADD COLUMN provider_payment_id text;
ALTER TABLE invoice_payment ADD CONSTRAINT invoice_payment_org_provider_unique UNIQUE (organization_id, provider_payment_id);

CREATE TABLE payment_checkout_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  provider text NOT NULL,
  provider_session_id text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'checkout_pending' CHECK (status IN ('checkout_pending','paid','failed','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_checkout_org_provider_session_unique UNIQUE (organization_id, provider, provider_session_id),
  CONSTRAINT payment_checkout_invoice_fk FOREIGN KEY (organization_id, invoice_id) REFERENCES invoice (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE payment_provider_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  invoice_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'expired')),
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  provider_payment_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_provider_event_org_event_unique UNIQUE (organization_id, provider, provider_event_id),
  CONSTRAINT payment_provider_event_invoice_fk FOREIGN KEY (organization_id, invoice_id) REFERENCES invoice (organization_id, id) ON DELETE CASCADE
);
