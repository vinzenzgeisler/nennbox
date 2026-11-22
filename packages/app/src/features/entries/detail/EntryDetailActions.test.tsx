// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';
import { EntryDetailActions } from './EntryDetailActions.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const workflow: WorkflowView = {
  statuses: [
    {
      key: 'submitted',
      category: 'pending',
      labels: { de: 'Offen', en: 'Open' },
      color: '',
    },
    {
      key: 'approved',
      category: 'accepted',
      labels: { de: 'Bestätigt', en: 'Accepted' },
      color: '',
    },
    {
      key: 'declined',
      category: 'rejected',
      labels: { de: 'Nicht zugelassen', en: 'Rejected' },
      color: '',
    },
    {
      key: 'waiting',
      category: 'waitlisted',
      labels: { de: 'Warteliste', en: 'Waiting' },
      color: '',
    },
    {
      key: 'cancelled',
      category: 'withdrawn',
      labels: { de: 'Zurückgezogen', en: 'Withdrawn' },
      color: '',
    },
  ],
  transitions: ['approved', 'declined', 'waiting', 'cancelled'].map((to) => ({
    from: 'submitted',
    to,
    reasonRequired: true,
  })),
};
const entry = {
  acceptanceStatus: 'submitted',
  availableActions: [
    'acceptance:approved',
    'acceptance:declined',
    'acceptance:waiting',
    'acceptance:cancelled',
  ],
  statusProjection: {
    dimensions: [{ key: 'entry', nextAction: { key: 'entry:approved' } }],
  },
} as unknown as Entry;
function mount(
  selected = entry,
  busy = false,
  view: WorkflowView | null = workflow,
) {
  const onStatus = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <EntryDetailActions
        selected={selected}
        workflow={view}
        busy={busy}
        onStatus={onStatus}
      />,
    ),
  );
  return onStatus;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
const directButtons = () => [
  ...host.querySelectorAll<HTMLButtonElement>('button:not([role=menuitem])'),
];

it('offers authorized transitions with localized status labels and category tones', () => {
  mount();
  expect(host.querySelector('summary')?.getAttribute('aria-label')).toBe(
    'Status: Offen',
  );
  expect(host.querySelector('summary')?.className).toContain(
    'nb-app-status-offen',
  );
  const options = [...host.querySelectorAll('[role=menuitem]')];
  expect(options.map((option) => option.textContent)).toEqual([
    'Warteliste',
    'Nicht zugelassen',
    'Zurückgezogen',
    'Bestätigt',
  ]);
  expect(options.map((option) => option.querySelector('i')?.className)).toEqual(
    [
      expect.stringContaining('nb-app-status-vor'),
      expect.stringContaining('nb-app-status-neg'),
      expect.stringContaining('nb-app-status-ab'),
      expect.stringContaining('nb-app-status-zu'),
    ],
  );
  expect(directButtons().map((button) => button.textContent)).toEqual([
    'Ablehnen',
    'Zulassen',
  ]);
});

it.each([
  ['Ablehnen', { to: 'declined', label: 'Ablehnen …', danger: true }],
  ['Zulassen', { to: 'approved', label: 'Zulassen', danger: false }],
])('passes the full transition from the %s shortcut', (label, step) => {
  const onStatus = mount();
  act(() =>
    directButtons()
      .find((button) => button.textContent === label)!
      .click(),
  );
  expect(onStatus).toHaveBeenCalledExactlyOnceWith(step);
});

it('selects menu transitions and closes the menu', () => {
  const onStatus = mount();
  const menu = host.querySelector('details')!;
  menu.open = true;
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
      .find((option) => option.textContent === 'Warteliste')!
      .click(),
  );
  expect(onStatus).toHaveBeenCalledExactlyOnceWith({
    to: 'waiting',
    label: 'Auf Warteliste setzen',
    danger: false,
  });
  expect(menu.open).toBe(false);
});

it('disables shortcuts and removes actionable menu options while busy', () => {
  const onStatus = mount(entry, true);
  expect(host.querySelector('[role=menuitem]')).toBeNull();
  expect(directButtons().every((button) => button.disabled)).toBe(true);
  act(() => directButtons().forEach((button) => button.click()));
  expect(onStatus).not.toHaveBeenCalled();
});

it('does not show forbidden transitions as menu options or shortcuts', () => {
  mount({ ...entry, availableActions: ['acceptance:waiting'] });
  expect(
    [...host.querySelectorAll('[role=menuitem]')].map(
      (option) => option.textContent,
    ),
  ).toEqual(['Warteliste']);
  expect(directButtons()).toHaveLength(0);
});

it('falls back to the stored status when no workflow exists without inventing actions', () => {
  mount({ ...entry, acceptanceStatus: 'custom' }, false, null);
  expect(host.querySelector('summary')?.getAttribute('aria-label')).toBe(
    'Status: custom',
  );
  expect(host.querySelector('[role=menuitem]')).toBeNull();
  expect(directButtons()).toHaveLength(0);
});

it.each([
  ['approved', 'zu'],
  ['waiting', 'vor'],
  ['declined', 'neg'],
  ['cancelled', 'ab'],
])('uses the current %s category tone', (acceptanceStatus, tone) => {
  mount({ ...entry, acceptanceStatus });
  expect(host.querySelector('summary')?.className).toContain(
    `nb-app-status-${tone}`,
  );
});

it.each([
  ['approved', 'Status: Zugelassen'],
  ['submitted', 'Status: Bestätigt'],
])(
  'uses server-projected wording only when it describes the current status (%s)',
  (value, expected) => {
    mount({
      ...entry,
      acceptanceStatus: 'approved',
      statusProjection: {
        dimensions: [
          {
            key: 'entry',
            value,
            label: { de: 'Zugelassen', en: 'Accepted' },
            meaning: 'done',
            required: true,
            nextAction: null,
          },
        ],
        documents: { complete: 0, total: 0 },
        hints: [],
      },
    });
    expect(host.querySelector('summary')?.getAttribute('aria-label')).toBe(
      expected,
    );
  },
);
