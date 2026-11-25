import { describe, expect, it } from 'vitest';
import { overpaymentText, refundIntentText } from './refundIntentText.js';
import { refundConflictText } from './refundConflictText.js';

const base = { percent: 50, refundedCents: 2100, failure: null };

describe('refund intent text', () => {
  it('shows the amount and share that was refunded automatically', () => {
    expect(
      refundIntentText({ ...base, status: 'done' }, 'EUR').replace(/\s/g, ' '),
    ).toBe('Automatisch erstattet: 21,00 € (50 % laut Erstattungsregel).');
  });

  it('makes a failed automatic refund visible and points to the manual refund', () => {
    const text = refundIntentText(
      {
        status: 'failed',
        percent: 50,
        refundedCents: 0,
        failure: 'provider_unavailable',
      },
      'EUR',
    );
    expect(text).toContain('fehlgeschlagen');
    expect(text).toContain('Stripe war nicht erreichbar');
    expect(text).toContain('Erstattung auslösen');
  });

  it('mentions what was already refunded when only part of it went through', () => {
    expect(
      refundIntentText(
        {
          status: 'failed',
          percent: 100,
          refundedCents: 1000,
          failure: 'ledger_rejected',
        },
        'EUR',
      ).replace(/\s/g, ' '),
    ).toContain('Bereits erstattet: 10,00 €');
  });

  it('says so when the rule gives nothing back and when the refund is still pending', () => {
    expect(
      refundIntentText(
        { status: 'skipped', percent: 0, refundedCents: 0, failure: null },
        'EUR',
      ),
    ).toContain('Keine automatische Erstattung');
    expect(
      refundIntentText(
        { status: 'pending', percent: null, refundedCents: 0, failure: null },
        'EUR',
      ),
    ).toContain('steht noch aus');
  });
});

describe('overpayment text', () => {
  const invoice = { totalCents: 4200, paidCents: 8400, currency: 'EUR' };

  it('names the surplus and points to the online refund when a provider payment exists', () => {
    const text = overpaymentText(invoice, true)!.replace(/\s/g, ' ');
    expect(text).toContain('Überzahlt um 42,00 €');
    expect(text).toContain('Erstattung auslösen');
  });

  it('asks for a manual refund when only bank payments exist', () => {
    expect(overpaymentText(invoice, false)).toContain('manuell');
  });

  it('is silent when nothing or exactly the invoice amount was paid', () => {
    expect(overpaymentText({ ...invoice, paidCents: 4200 }, true)).toBeNull();
    expect(overpaymentText({ ...invoice, paidCents: 0 }, true)).toBeNull();
  });
});

describe('refund intent text after the review', () => {
  it('does not call a payment after the cancellation a failed automatic refund', () => {
    const text = refundIntentText(
      {
        status: 'failed',
        percent: null,
        refundedCents: 0,
        failure: 'payment_after_cancellation',
      },
      'EUR',
    );
    expect(text).toContain('in voller Höhe erstattbar');
    expect(text).not.toContain('fehlgeschlagen');
  });
  it('keeps what was refunded when the registration took part again', () => {
    expect(
      refundIntentText(
        {
          status: 'superseded',
          percent: 50,
          refundedCents: 2100,
          failure: null,
        },
        'EUR',
      ).replace(/\s/g, ' '),
    ).toBe(
      'Die frühere automatische Erstattung (21,00 €) wurde ausgeführt. Danach wurde die Nennung wieder aufgenommen.',
    );
  });
  it('explains a refund that needs review without sending the office back to the same dialog', () => {
    const text = refundIntentText(
      {
        status: 'failed',
        percent: 100,
        refundedCents: 0,
        failure: 'needs_review',
      },
      'EUR',
    );
    expect(text).toContain('wartet auf deine Entscheidung');
    expect(text).not.toContain('Bitte erstatte den Rest');
  });
});

describe('refund conflict text', () => {
  it.each([
    ['exceeds_available', 'noch erstattbar'],
    ['invalid_amount', 'größer als 0'],
    ['closed', 'abgelehnt oder vom Nennbüro abgebrochen'],
    ['key_conflict', 'anderen Eingabe'],
    [undefined, 'nicht (mehr) erstattbar'],
  ])('names the reason %s', (reason, expected) => {
    expect(refundConflictText('Refund amount unavailable', reason)).toContain(
      expected,
    );
  });
  it('explains review and concurrency conflicts, and leaves other codes alone', () => {
    expect(refundConflictText('Refund needs review')).toContain(
      'Stripe-Dashboard',
    );
    expect(refundConflictText('concurrent_update')).toContain('gleichzeitig');
    expect(refundConflictText('Passenger exists')).toBeUndefined();
  });
});
