import { formatMoney } from '../../../format.js';

type RefundIntent = {
  status: 'pending' | 'done' | 'failed' | 'skipped';
  percent: number | null;
  refundedCents: number;
  failure: string | null;
};

const failureText: Record<string, string> = {
  provider_unavailable: 'Stripe war nicht erreichbar oder hat abgelehnt',
  ledger_rejected:
    'Die Erstattung konnte nicht im Zahlungsprotokoll verbucht werden',
};

/** What the organizer should know about the automatic refund of a cancelled entry. */
export function refundIntentText(
  intent: RefundIntent,
  currency: string,
): string {
  if (intent.status === 'pending')
    return 'Die automatische Erstattung nach der Absage steht noch aus.';
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
