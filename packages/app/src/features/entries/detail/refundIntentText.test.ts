import { describe, expect, it } from 'vitest';
import { refundIntentText } from './refundIntentText.js';

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
