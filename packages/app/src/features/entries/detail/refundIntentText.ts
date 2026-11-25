import { formatMoney } from '../../../format.js';

type RefundIntent = {
  status:
    'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'superseded';
  percent: number | null;
  refundedCents: number;
  failure: string | null;
};

const failureText: Record<string, string> = {
  payment_after_cancellation:
    'Zahlung nach Absage eingegangen; manuelle Erstattung erforderlich',
  needs_review:
    'Stripe konnte die Erstattung mehrfach nicht ausführen. Sie wird nicht mehr automatisch wiederholt und wartet auf deine Entscheidung',
  reservation_abandoned:
    'Die hängende Erstattung wurde vom Nennbüro abgebrochen',
  intent_data_missing:
    'Rechnung oder Veranstaltung der Erstattung wurde nicht gefunden',
  provider_rejected:
    'Stripe hat die Erstattung endgültig abgelehnt. Der reservierte Betrag ist wieder freigegeben',
  provider_unavailable: 'Stripe war nicht erreichbar oder hat abgelehnt',
  reactivated_during_refund:
    'Die Nennung wurde wieder aufgenommen, während die Erstattung lief. Bitte prüfe im Stripe-Dashboard, ob sie ausgeführt wurde',
  ledger_rejected:
    'Die Erstattung konnte nicht im Zahlungsprotokoll verbucht werden',
};

/** What the organizer should know about the automatic refund of a cancelled entry. */
export function refundIntentText(
  intent: RefundIntent,
  currency: string,
): string {
  if (intent.failure === 'payment_after_cancellation')
    return 'Zahlung nach der Absage eingegangen. Sie ist in voller Höhe erstattbar, die Erstattungsregel gilt dafür nicht. Bitte zahle sie über „Erstattung auslösen“ zurück.';
  if (intent.status === 'superseded')
    return `Die frühere automatische Erstattung (${formatMoney(intent.refundedCents, currency)}) wurde ausgeführt. Danach wurde die Nennung wieder aufgenommen.`;
  if (intent.status === 'pending' || intent.status === 'processing')
    return 'Die automatische Erstattung nach der Absage steht noch aus. Bleibt sie länger offen, wird sie automatisch erneut versucht.';
  if (intent.status === 'done')
    return `Automatisch erstattet: ${formatMoney(intent.refundedCents, currency)} (${intent.percent ?? 0} % laut Erstattungsregel).`;
  if (
    intent.status === 'skipped' &&
    intent.failure === 'registration_reactivated'
  )
    return 'Keine automatische Erstattung: Die Nennung wurde wieder aufgenommen, bevor erstattet wurde.';
  if (intent.status === 'skipped')
    return 'Keine automatische Erstattung: Die Erstattungsregel sieht für diesen Zeitpunkt nichts vor.';
  const reason = failureText[intent.failure ?? ''] ?? 'Unbekannter Fehler';
  const partial =
    intent.refundedCents > 0
      ? ` Bereits erstattet: ${formatMoney(intent.refundedCents, currency)}.`
      : '';
  if (intent.failure === 'needs_review')
    return `Die automatische Erstattung ist fehlgeschlagen (${reason}).${partial}`;
  return `Die automatische Erstattung ist fehlgeschlagen (${reason}).${partial} Bitte erstatte den Rest über „Erstattung auslösen“.`;
}

/** A refund Stripe could not execute repeatedly; it still blocks its amount until the office decides. */
export function stuckRefundText(amountCents: number, currency: string): string {
  return `Eine Erstattung von ${formatMoney(amountCents, currency)} hängt: Stripe konnte sie mehrfach nicht ausführen, sie wird nicht mehr automatisch wiederholt. Der Betrag bleibt gesperrt, und die Nennung kann nicht wieder aufgenommen werden. Prüfe im Stripe-Dashboard, ob sie ausgeführt wurde; falls nicht, brich sie hier ab.`;
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
