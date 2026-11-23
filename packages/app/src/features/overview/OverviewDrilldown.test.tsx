// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OverviewMetrics } from './OverviewMetrics.js';
import { OverviewClasses } from './OverviewClasses.js';
import { OverviewStatuses } from './OverviewStatuses.js';

afterEach(() => vi.unstubAllGlobals());

it('opens each entry metric, workflow status and class with only its intended filter', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const onOpenEntries = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  const overview = {
    eventId: 'event',
    statuses: { shortlist: 3 },
    openPayments: { count: 2, amountCents: 1000, currency: 'EUR' },
    missingDocuments: { count: 1 },
    classes: [
      { classId: 'touring', name: 'Touring', occupied: 3, capacity: 10 },
    ],
    daysUntilRegistrationCloses: null,
    warnings: [],
  };
  act(() =>
    root.render(
      <>
        <OverviewMetrics overview={overview} onOpenEntries={onOpenEntries} />
        <OverviewStatuses
          statuses={overview.statuses}
          workflowStatuses={[
            {
              key: 'shortlist',
              labels: { de: 'Vorauswahl', en: 'Shortlist' },
              category: 'pending',
              color: '#64748b',
            },
          ]}
          onOpenEntries={onOpenEntries}
        />
        <OverviewClasses
          classes={overview.classes}
          onOpenEntries={onOpenEntries}
        />
      </>,
    ),
  );
  try {
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Alle Nennungen anzeigen',
      'Nennungen mit offenen Zahlungen anzeigen',
      'Nennungen mit fehlenden Unterlagen anzeigen',
      'Vorauswahl: 3 Nennungen anzeigen',
      'Touring: Nennungen anzeigen',
    ]);
    for (const button of buttons) act(() => button.click());
    expect(onOpenEntries.mock.calls).toEqual([
      [{}],
      [{ paymentStatus: 'outstanding' }],
      [{ missingDocuments: 'true' }],
      [{ acceptanceStatus: 'shortlist' }],
      [{ classId: 'touring' }],
    ]);
  } finally {
    act(() => root.unmount());
  }
});
