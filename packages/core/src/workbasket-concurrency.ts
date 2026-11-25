/** A bounded authoritative action exhausted its transaction retries. */
export class WorkbasketConcurrencyError extends Error {
  constructor(cause: unknown) {
    super(
      'Gleichzeitige Änderungen an der Veranstaltung. Bitte erneut versuchen; beim Versand denselben Auftrag beibehalten.',
      { cause },
    );
    this.name = 'WorkbasketConcurrencyError';
  }
}
