ALTER TABLE invoice ADD COLUMN paid_at timestamptz;

-- Replay the ledger, not checkout/provider creation dates. The current paid
-- period starts at the last transition from below the invoice total to paid.
-- Group equal timestamps: their internal order cannot change the resulting date.
CREATE FUNCTION invoice_ledger_paid_at(tenant_id uuid, target_id uuid, total integer)
RETURNS timestamptz
LANGUAGE sql STABLE
AS $$
  WITH balances AS (
    SELECT occurred_at,
      sum(sum(amount_cents)) OVER (ORDER BY occurred_at) AS balance
    FROM invoice_payment
    WHERE organization_id = tenant_id AND invoice_id = target_id
    GROUP BY occurred_at
  )
  SELECT min(occurred_at)
  FROM balances
  WHERE balance >= total
    AND occurred_at > coalesce(
      (SELECT max(occurred_at) FROM balances WHERE balance < total),
      '-infinity'::timestamptz
    )
$$;

UPDATE invoice
SET paid_at = invoice_ledger_paid_at(organization_id, id, total_cents)
WHERE status = 'paid';

-- Every source updates invoice status after writing its ledger entry, including
-- bank imports, office/manual payments, provider webhooks and refunds.
CREATE FUNCTION maintain_invoice_paid_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    NEW.paid_at := invoice_ledger_paid_at(NEW.organization_id, NEW.id, NEW.total_cents);
  ELSE
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER invoice_paid_at
BEFORE INSERT OR UPDATE OF status, total_cents ON invoice
FOR EACH ROW EXECUTE FUNCTION maintain_invoice_paid_at();
