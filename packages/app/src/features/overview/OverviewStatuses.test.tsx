// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverviewStatuses } from './OverviewStatuses.js';

function rows(statuses: Record<string, number>) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <OverviewStatuses statuses={statuses} />,
  );
  return Array.from(host.querySelectorAll('.nb-app-value-row')).map((row) => ({
    label: row.querySelector('.nb-app-pill')?.textContent,
    count: row.querySelector('strong')?.textContent,
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
      { label: 'Warteliste', count: '3' },
      { label: 'Zugelassen', count: '12' },
      { label: 'Abgelehnt', count: '0' },
      { label: 'Zurückgezogen', count: '0' },
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
  it('shows an explicit empty state without placeholder rows', () => {
    expect(rows({})).toEqual([]);
    expect(renderToStaticMarkup(<OverviewStatuses statuses={{}} />)).toContain(
      'Noch keine Nennungen.',
    );
  });
});
