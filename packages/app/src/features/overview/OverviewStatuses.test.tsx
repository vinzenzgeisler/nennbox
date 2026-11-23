// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverviewStatuses } from './OverviewStatuses.js';

const workflowStatuses = [
  ['pending', 'Offen'],
  ['waitlisted', 'Vorauswahl'],
  ['accepted', 'Zugelassen'],
  ['rejected', 'Abgelehnt'],
  ['withdrawn', 'Abgesagt'],
].map(([key, de]) => ({
  key: key!,
  labels: { de: de!, en: de! },
  category: key!,
  color: '#64748b',
}));
function rows(statuses: Record<string, number>) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <OverviewStatuses
      statuses={statuses}
      workflowStatuses={workflowStatuses}
      onOpenEntries={() => {}}
    />,
  );
  return Array.from(host.querySelectorAll('.nb-app-value-row')).map((row) => ({
    label: row.querySelector('.nb-app-pill')?.textContent,
    count: row.querySelector('button')?.textContent,
  }));
}

describe('overview status rows', () => {
  it('renders every demo workflow category with a visible label, including zero counts', () => {
    expect(
      rows({
        withdrawn: 0,
        accepted: 12,
        rejected: 0,
        waitlisted: 3,
        pending: 5,
      }),
    ).toEqual([
      { label: 'Offen', count: '5' },
      { label: 'Vorauswahl', count: '3' },
      { label: 'Zugelassen', count: '12' },
      { label: 'Abgelehnt', count: '0' },
      { label: 'Abgesagt', count: '0' },
    ]);
  });
  it('keeps custom and unnamed categories readable instead of rendering blank pills', () => {
    expect(rows({ '': 2, '   ': 0, 'Eigene Prüfung': 4 })).toEqual(
      expect.arrayContaining([
        { label: 'Unbekannter Status', count: '2' },
        { label: 'Unbekannter Status', count: '0' },
        { label: 'Eigene Prüfung', count: '4' },
      ]),
    );
  });
  it('shows an explicit empty state when no statuses or workflow are available', () => {
    expect(
      renderToStaticMarkup(
        <OverviewStatuses
          statuses={{}}
          workflowStatuses={[]}
          onOpenEntries={() => {}}
        />,
      ),
    ).toContain('Noch keine Nennungen.');
  });
});
