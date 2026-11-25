/** What a 409 of the refund routes or a concurrent change means for the office. */
export const refundConflictText = (code?: string, reason?: string) =>
  code === 'Refund amount unavailable'
    ? reason === 'exceeds_available'
      ? 'Der Betrag übersteigt das, was bei Stripe noch erstattbar ist (eingenommen minus bereits erstattet oder reserviert). Bitte lade die Detailansicht neu.'
      : reason === 'invalid_amount'
        ? 'Bitte gib einen Erstattungsbetrag größer als 0 an.'
        : reason === 'closed'
          ? 'Diese Erstattung wurde von Stripe abgelehnt oder vom Nennbüro abgebrochen. Bitte löse sie neu aus.'
          : reason === 'key_conflict'
            ? 'Dieser Erstattungsvorgang gehört zu einer anderen Eingabe. Bitte öffne den Dialog neu.'
            : 'Dieser Betrag ist nicht (mehr) erstattbar. Bitte lade die Detailansicht neu.'
    : code === 'Refund needs review'
      ? 'Stripe konnte den Ausgang mehrfach nicht bestätigen. Unklare Vorgänge werden mit demselben Schlüssel weiter abgeglichen; der Betrag bleibt reserviert. Prüfe im Stripe-Dashboard und fordere bei Bedarf eine Klärung an. Nur sicher nicht ausgeführte Vorgänge dürfen freigegeben werden.'
      : code ===
          'Refund cannot be released: not waiting for review or provider outcome still uncertain; request reconciliation'
        ? 'Die Erstattung kann nicht freigegeben werden: Sie wartet nicht auf Prüfung oder ihr Stripe-Ausgang ist noch unklar. Bitte fordere eine Klärung an; bis zur Bestätigung bleibt der Betrag reserviert.'
        : code === 'concurrent_update'
          ? 'Die Nennung wurde gerade gleichzeitig geändert. Bitte versuche es noch einmal.'
          : undefined;
