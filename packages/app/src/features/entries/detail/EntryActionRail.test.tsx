// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { Icon, type IconName } from '@nennbox/ui';
import { EntryActionRail } from './EntryActionRail.js';

it('keeps destructive transitions and deletion after every ordinary action', () => {
  const entry = {
    acceptanceStatus: 'pending',
    verificationStatus: 'unverified',
    availableActions: [
      'acceptance:rejected',
      'acceptance:accepted',
      'delete',
      'note:internal',
      'change_class',
      'adjust_amount',
      'passenger:add',
      'passenger:link',
    ],
    adminDetails: { invoice: { status: 'open' } },
  } as unknown as Entry;
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <EntryActionRail
      entry={entry}
      busy={false}
      workflow={{
        statuses: [
          {
            key: 'rejected',
            category: 'rejected',
            labels: { de: 'Abgelehnt', en: 'Rejected' },
            color: '',
          },
          {
            key: 'accepted',
            category: 'accepted',
            labels: { de: 'Zugelassen', en: 'Accepted' },
            color: '',
          },
        ],
        transitions: ['rejected', 'accepted'].map((to) => ({
          from: 'pending',
          to,
          reasonRequired: true,
        })),
      }}
      onStatus={vi.fn()}
      onVerify={vi.fn()}
      onPayment={vi.fn()}
      onDimension={vi.fn()}
      onAdminAction={vi.fn()}
      onPassenger={vi.fn()}
      onMessage={vi.fn()}
    />,
  );
  const buttons = [...host.querySelectorAll('button')];
  expect(buttons.map((button) => button.textContent)).toEqual([
    'E-Mail verifizieren',
    'Zahlung erfassen',
    'Beifahrer nachmelden',
    'Persönlichen Link erstellen',
    'Nachricht schreiben',
    'Zulassen',
    'Klasse ändern',
    'Betrag anpassen',
    'Notiz hinzufügen',
    'Ablehnen …',
    'Nennung löschen …',
  ]);
  const danger = host.querySelector('.nb-entry-danger-actions')!;
  expect([...danger.querySelectorAll('button')]).toEqual(buttons.slice(-2));
  const group = danger.querySelector('section')!;
  expect(group.getAttribute('aria-label')).toBe('Ablehnen und Löschen');
  expect(group.querySelector('h3')).toBeNull();
  expect(host.textContent).not.toContain('Destruktive Aktionen');
  const assignments: [string, IconName][] = [
    ['E-Mail verifizieren', 'check'],
    ['Zahlung erfassen', 'payment'],
    ['Beifahrer nachmelden', 'person'],
    ['Persönlichen Link erstellen', 'link'],
    ['Nachricht schreiben', 'mail'],
    ['Zulassen', 'switch'],
    ['Klasse ändern', 'tag'],
    ['Betrag anpassen', 'amount'],
    ['Notiz hinzufügen', 'note'],
    ['Ablehnen …', 'warning'],
    ['Nennung löschen …', 'trash'],
  ];
  const names = assignments.map(([, name]) => name);
  const shared = names.filter((name, index) => names.indexOf(name) !== index);
  expect(shared, 'icons shared by different actions').toEqual([]);
  for (const [label, name] of assignments) {
    const button = buttons.find((item) => item.textContent === label)!;
    expect(button.querySelector('svg')!.outerHTML, label).toBe(
      renderToStaticMarkup(<Icon name={name} />),
    );
  }
  expect(
    buttons.every((button) => button.querySelector('svg[aria-hidden=true]')),
  ).toBe(true);
  expect(
    buttons
      .slice(0, -2)
      .every((button) => !button.classList.contains('nb-rail-danger')),
  ).toBe(true);
});
