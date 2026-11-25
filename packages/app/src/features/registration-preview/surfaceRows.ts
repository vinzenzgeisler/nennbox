type Row = [string, string];

/** Value rows of the arrival surfaces: received/waiting list, admitted and the fictional bank data. */
export function surfaceRows(
  t: (de: string, en: string) => string,
  isWaitlist: boolean,
  amount: string,
) {
  const confirmationRows: Row[] = [
    [t('Nennung', 'Entry'), isWaitlist ? 'BP27-4419' : 'BP27-4417'],
    [
      t('Startmeldung', 'Vehicle entry'),
      'Porsche 911 SC · ' +
        (isWaitlist
          ? t('Rennwagen', 'Racing cars')
          : t('Serienwagen über 1600', 'Production cars over 1600')),
    ],
    [
      isWaitlist
        ? t('Platz auf der Warteliste', 'Waiting list position')
        : t('Status', 'Status'),
      isWaitlist
        ? t('4 von 4', '4 of 4')
        : t('Eingegangen, noch nicht zugelassen', 'Received, not yet admitted'),
    ],
    [
      t('Startgeld', 'Entry fee'),
      amount +
        ' · ' +
        (isWaitlist
          ? t('fällig beim Nachrücken', 'due when you move up')
          : t('fällig nach Zulassung', 'due after admission')),
    ],
  ];
  const admittedRows: Row[] = [
    [t('Nennung', 'Entry'), 'BP27-4417'],
    [t('Startnummer', 'Number'), '42 · ' + t('freigegeben', 'released')],
    [
      t('Klasse', 'Class'),
      t('Serienwagen über 1600 cm³', 'Production cars over 1600 cc'),
    ],
    [
      t('Zu zahlen', 'Amount due'),
      amount + t(' bis 19. April', ' by 19 April'),
    ],
  ];
  const bankRows: Row[] = [
    [t('Empfänger', 'Recipient'), 'DEMO · MSC Hohenstein e. V.'],
    ['IBAN', 'DE00 0000 0000 0000 0000 00'],
    [t('Betrag', 'Amount'), amount],
    [t('Zahlungszweck', 'Reference'), 'DEMO-BP27-4417-PROBE'],
  ];
  return { confirmationRows, admittedRows, bankRows };
}
