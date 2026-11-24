ALTER TABLE payment_refund_reservation ADD COLUMN actor text NOT NULL DEFAULT 'system:refund-recovery';
ALTER TABLE payment_refund_reservation ADD COLUMN reason text NOT NULL DEFAULT 'Refund recovery';
ALTER TABLE payment_refund_reservation DROP CONSTRAINT payment_refund_reservation_status_check;
ALTER TABLE payment_refund_reservation ADD CONSTRAINT payment_refund_reservation_status_check CHECK (status IN ('reserved', 'completed', 'rejected'));
