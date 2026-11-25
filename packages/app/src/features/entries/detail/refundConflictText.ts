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
      ? 'Stripe konnte die Erstattung mehrfach nicht ausführen. Sie wird nicht mehr automatisch wiederholt. Prüfe sie im Stripe-Dashboard und entscheide in der Detailansicht der Nennung.'
      : code === 'Refund is not waiting for review'
        ? 'Diese Erstattung wartet nicht mehr auf eine Entscheidung. Bitte lade die Detailansicht neu.'
        : code === 'concurrent_update'
          ? 'Die Nennung wurde gerade gleichzeitig geändert. Bitte versuche es noch einmal.'
          : undefined;
