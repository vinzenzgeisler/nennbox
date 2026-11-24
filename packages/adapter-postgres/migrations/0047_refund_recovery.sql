ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT 'system:refund-recovery';
ALTER TABLE payment_refund_reservation ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'Refund recovery';
ALTER TABLE payment_refund_reservation DROP CONSTRAINT IF EXISTS payment_refund_reservation_status_check;
ALTER TABLE payment_refund_reservation ADD CONSTRAINT payment_refund_reservation_status_check CHECK (status IN ('reserved', 'completed', 'rejected'));
