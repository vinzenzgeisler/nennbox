import { formatMoney } from '../../../format.js';

type RefundIntent = {
  status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped';
  percent: number | null;
  refundedCents: number;
  failure: string | null;
};

const failureText: Record<string, string> = {
  payment_after_cancellation:
    'Zahlung nach Absage eingegangen; manuelle Erstattung erforderlich',
  intent_data_missing:
    'Rechnung oder Veranstaltung der Erstattung wurde nicht gefunden',
  provider_unavailable: 'Stripe war nicht erreichbar oder hat abgelehnt',
  ledger_rejected:
    'Die Erstattung konnte nicht im Zahlungsprotokoll verbucht werden',
};

/** What the organizer should know about the automatic refund of a cancelled entry. */
export function refundIntentText(
  intent: RefundIntent,
  currency: string,
): string {
  if (intent.status === 'pending' || intent.status === 'processing')
    return 'Die automatische Erstattung nach der Absage steht noch aus. Bleibt sie länger offen, wird sie automatisch erneut versucht.';
  if (intent.status === 'done')
    return `Automatisch erstattet: ${formatMoney(intent.refundedCents, currency)} (${intent.percent ?? 0} % laut Erstattungsregel).`;
  if (intent.status === 'skipped')
    return 'Keine automatische Erstattung: Die Erstattungsregel sieht für diesen Zeitpunkt nichts vor.';
  const reason = failureText[intent.failure ?? ''] ?? 'Unbekannter Fehler';
  const partial =
    intent.refundedCents > 0
      ? ` Bereits erstattet: ${formatMoney(intent.refundedCents, currency)}.`
      : '';
  return `Die automatische Erstattung ist fehlgeschlagen (${reason}).${partial} Bitte erstatte den Rest über „Erstattung auslösen“.`;
}

/** Paid more than the invoice asks for (for example a transfer and a checkout both went through). */
export function overpaymentText(
  invoice: { totalCents: number; paidCents: number; currency: string },
  canRefundOnline: boolean,
): string | null {
  const surplus = invoice.paidCents - invoice.totalCents;
  if (surplus <= 0) return null;
  return `Überzahlt um ${formatMoney(surplus, invoice.currency)}: Es wurde mehr bezahlt, als die Rechnung verlangt. ${
    canRefundOnline
      ? 'Den Überschuss kannst du über „Erstattung auslösen“ zurückzahlen.'
      : 'Bitte erstatte den Überschuss manuell, zum Beispiel per Überweisung, und erfasse die Rückzahlung.'
  }`;
}
