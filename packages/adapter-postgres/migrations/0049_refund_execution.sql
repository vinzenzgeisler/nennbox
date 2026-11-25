ALTER TABLE payment_refund_reservation ADD COLUMN execution_token uuid;
ALTER TABLE payment_refund_reservation ADD COLUMN execution_uncertain boolean NOT NULL DEFAULT false;
