-- A reserved refund the provider cannot settle must not stay reserved forever:
-- failed attempts are counted, after the limit the reservation is flagged for
-- review (no more automatic retries, the amount stays blocked) and the office
-- can abandon it with an audited reason ('abandoned' releases the amount).
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS needs_review_at timestamptz;
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS resolved_reason text;
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE payment_refund_reservation DROP CONSTRAINT IF EXISTS payment_refund_reservation_status_check;
ALTER TABLE payment_refund_reservation ADD CONSTRAINT payment_refund_reservation_status_check CHECK (status IN ('reserved', 'completed', 'rejected', 'abandoned'));
-- Money that arrives after a cancellation has its own trigger instead of a
-- borrowed 'withdrawn'; it is refundable in full and never driven by the rule.
ALTER TABLE payment_refund_intent DROP CONSTRAINT IF EXISTS payment_refund_intent_trigger_check;
ALTER TABLE payment_refund_intent ADD CONSTRAINT payment_refund_intent_trigger_check CHECK (trigger IN ('withdrawn', 'rejected', 'late_payment'));
-- A finished intent stays as it was when the registration takes part again.
ALTER TABLE payment_refund_intent DROP CONSTRAINT IF EXISTS payment_refund_intent_status_check;
ALTER TABLE payment_refund_intent ADD CONSTRAINT payment_refund_intent_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped', 'superseded'));
