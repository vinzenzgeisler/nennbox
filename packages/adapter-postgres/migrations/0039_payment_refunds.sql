ALTER TABLE invoice_payment DROP CONSTRAINT invoice_payment_org_provider_unique;
ALTER TABLE invoice_payment ADD COLUMN provider_refund_id text;
CREATE UNIQUE INDEX invoice_payment_org_provider_unique ON invoice_payment (organization_id, provider_payment_id) WHERE provider_payment_id IS NOT NULL AND provider_refund_id IS NULL;
ALTER TABLE invoice_payment ADD CONSTRAINT invoice_payment_org_refund_unique UNIQUE (organization_id, provider_refund_id);
