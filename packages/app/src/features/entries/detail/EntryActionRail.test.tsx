// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
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
    ],
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
    'Nachricht schreiben',
    'Zulassen',
    'Notiz hinzufügen',
    'Ablehnen …',
    'Nennung löschen …',
  ]);
  const danger = host.querySelector('.nb-entry-danger-actions')!;
  expect([...danger.querySelectorAll('button')]).toEqual(buttons.slice(-2));
  expect(
    buttons.every((button) => button.querySelector('svg[aria-hidden=true]')),
  ).toBe(true);
  expect(
    buttons
      .slice(0, -2)
      .every((button) => !button.classList.contains('nb-rail-danger')),
  ).toBe(true);
});
