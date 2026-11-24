-- Every refund (manual or automatic) is reserved under the invoice row lock
-- before the provider is called. The reservation stores the amount and the
-- provider idempotency key, so a retry resumes the same operation instead of
-- computing a new amount, and concurrent refunds see each other's reservations.
-- 'reserved' counts against what can still be refunded until the ledger entry
-- is written (status 'completed', same transaction).
CREATE TABLE IF NOT EXISTS payment_refund_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  provider_payment_id text NOT NULL,
  idempotency_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('manual', 'automatic')),
  intent_id uuid REFERENCES payment_refund_intent (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed')),
  provider_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_refund_reservation_invoice_fk FOREIGN KEY (organization_id, invoice_id) REFERENCES invoice (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT payment_refund_reservation_key_unique UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS payment_refund_reservation_open_idx ON payment_refund_reservation (organization_id, invoice_id, provider_payment_id) WHERE status = 'reserved';
