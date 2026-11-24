-- Payment method per ledger entry. Provider payments and their refunds are
-- "online"; everything an organizer records by hand stays "manual".
ALTER TABLE invoice_payment ADD COLUMN method text NOT NULL DEFAULT 'manual';
UPDATE invoice_payment SET method = 'online' WHERE provider_payment_id IS NOT NULL;
ALTER TABLE invoice_payment ADD CONSTRAINT invoice_payment_method_check CHECK (method IN ('manual', 'online'));

-- A checkout session remembers what it was created for (amount and methods), so
-- a later "pay now" can reuse a still-valid session and any other one is replaced.
-- Sessions from before this migration keep NULL and are always replaced.
ALTER TABLE payment_checkout_session ADD COLUMN amount_cents integer;
ALTER TABLE payment_checkout_session ADD COLUMN payment_methods text[];
ALTER TABLE payment_checkout_session ADD COLUMN expires_at timestamptz;
ALTER TABLE payment_checkout_session ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Stripe delivers events unordered, so a late "expired" or "failed" can arrive
-- after "paid". Money received wins: "paid" is never left, and "failed"/"expired"
-- can only still become "paid". The stored outcome is independent of the order.
CREATE FUNCTION keep_checkout_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    NEW.status := 'paid';
  ELSIF OLD.status IN ('failed', 'expired') AND NEW.status <> 'paid' THEN
    NEW.status := OLD.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
CREATE TRIGGER payment_checkout_session_terminal
BEFORE UPDATE OF status ON payment_checkout_session
FOR EACH ROW EXECUTE FUNCTION keep_checkout_terminal_status();

-- Automatic refund after a cancellation. One open or finished intent per invoice;
-- a failed one stays visible and does not block a later attempt. 'processing' marks
-- an intent a worker or request has taken; one that stays there is picked up again.
CREATE TABLE payment_refund_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('withdrawn', 'rejected')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  percent integer CHECK (percent BETWEEN 0 AND 100),
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  failure text,
  claimed_at timestamptz,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_refund_intent_invoice_fk FOREIGN KEY (organization_id, invoice_id) REFERENCES invoice (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT payment_refund_intent_entry_fk FOREIGN KEY (organization_id, entry_id) REFERENCES entry (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX payment_refund_intent_open_unique ON payment_refund_intent (organization_id, invoice_id) WHERE status IN ('pending', 'processing', 'done');

ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link','payment-received'));
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link','driver-portal-link','payment-received'));
