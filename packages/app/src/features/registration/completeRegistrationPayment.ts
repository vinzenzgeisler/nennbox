type PaymentInstructions = {
  accountName: string;
  iban: string;
  bic: string | null;
  paymentReference: string;
  amountCents: number;
  currency: string;
};

export async function completeRegistrationPayment({
  result,
  paymentChoice,
  organizationId,
  paymentMethods,
  setPaymentInstructions,
  setSubmitted,
}: {
  result: { invoiceId?: string; paymentInstructions?: PaymentInstructions };
  paymentChoice: 'online' | 'bank_transfer' | 'later';
  organizationId: string;
  paymentMethods: readonly string[];
  setPaymentInstructions: (value: PaymentInstructions) => void;
  setSubmitted: (value: boolean) => void;
}) {
  if (paymentChoice === 'online') {
    if (!result.invoiceId) throw new Error('Invoice unavailable');
    const response = await fetch(
      `/public/organizations/${encodeURIComponent(organizationId)}/invoices/${encodeURIComponent(result.invoiceId)}/checkout`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentMethods }),
      },
    );
    const destination = (await response.json().catch(() => null)) as {
      url?: string;
    } | null;
    if (!response.ok || !destination?.url)
      throw new Error('Checkout unavailable');
    window.location.assign(destination.url);
    return;
  }
  if (paymentChoice === 'bank_transfer' && result.paymentInstructions)
    setPaymentInstructions(result.paymentInstructions);
  setSubmitted(true);
}
