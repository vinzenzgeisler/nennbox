import { describe, expect, it } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { timelineFor } from './entryTimeline.js';

describe('entry payment timeline', () => {
  it('distinguishes a Stripe refund from a payment receipt', () => {
    const entry = {
      createdAt: '2030-01-01T00:00:00.000Z',
      adminHistory: [
        {
          id: 'refund-audit',
          kind: 'payment',
          label: 'refund',
          actor: 'admin',
          occurredAt: '2030-01-02T00:00:00.000Z',
          detail: 'Partial refund',
        },
      ],
    } as unknown as Entry;
    expect(timelineFor(entry, null, new Map())[0]?.title).toBe(
      'Zahlung erstattet',
    );
  });
});
