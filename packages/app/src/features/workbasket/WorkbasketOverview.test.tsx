// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkbasketOverview } from './WorkbasketOverview.js';
import { prioritizedTasks } from './workbasketModel.js';
vi.mock('./WorkbasketBulkActions.js', () => ({
  WorkbasketBulkActions: () => null,
}));
const request = vi.hoisted(() => vi.fn());
vi.mock('../../auth.js', () => ({ adminFetch: request }));
afterEach(() => {
  vi.unstubAllGlobals();
  request.mockReset();
});
const task = (
  ruleId: string,
  severity: 'warning' | 'task',
  entryId = 'entry',
) => ({
  ruleId,
  severity,
  entryId,
  classId: 'class',
  reason: `Grund: ${ruleId}`,
  fields: ['year', 'minYear'],
});
it('prioritizes warnings before reminders and ready tasks without changing evidence', () => {
  const tasks = [
    task('ready', 'task'),
    task('paymentOpen', 'task'),
    task('year', 'warning'),
  ];
  expect(prioritizedTasks(tasks)).toEqual([tasks[2], tasks[1], tasks[0]]);
  expect(tasks[0]?.ruleId).toBe('ready');
});
it('shows API explanations, rule counts, live filtering and entry/class navigation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  request.mockResolvedValue(
    Response.json({
      tasks: [
        task('ready', 'task'),
        task('year', 'warning'),
        { ...task('capacityNear', 'warning'), entryId: null },
      ],
      counts: { ready: 1, year: 1, capacityNear: 1 },
      generation: 1,
    }),
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  const openClass = vi.fn();
  await act(async () =>
    root.render(
      <WorkbasketOverview
        eventId="event"
        onOpenEntry={open}
        onOpenClass={openClass}
      />,
    ),
  );
  try {
    expect(host.textContent).toContain('Grund: year');
    expect(host.textContent).not.toContain('Betroffene Datenfelder');
    expect(host.textContent).not.toContain('Baujahr-Untergrenze');
    const filter = [
      ...host.querySelectorAll<HTMLButtonElement>('nav button'),
    ].find((button) => button.textContent === 'Baujahr prüfen (1)')!;
    await act(async () => {
      filter.click();
    });
    expect(filter.getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).not.toContain('Grund: ready');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find(
          (button) => button.getAttribute('aria-label') === 'Nennung öffnen',
        )!
        .click(),
    );
    expect(open).toHaveBeenCalledWith('entry');
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('nav button')]
        .find((button) => button.textContent === 'Klasse fast voll (1)')!
        .click();
    });
    act(() =>
      [...host.querySelectorAll('button')]
        .find(
          (button) =>
            button.getAttribute('aria-label') === 'Nennungen der Klasse öffnen',
        )!
        .click(),
    );
    expect(openClass).toHaveBeenCalledWith('class');
  } finally {
    act(() => root.unmount());
  }
});
it('distinguishes a quiet day from a failed API request', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  request.mockResolvedValue(
    Response.json({ tasks: [], counts: {}, generation: 1 }),
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <WorkbasketOverview
        eventId="event"
        onOpenEntry={vi.fn()}
        onOpenClass={vi.fn()}
      />,
    ),
  );
  expect(host.textContent).toContain('Alles erledigt');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  request.mockRejectedValue(new Error('offline'));
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Arbeitskorb aktualisieren')!
      .click(),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'konnte nicht geladen',
  );
  act(() => root.unmount());
});

it('renders concrete API facts and gives both duplicate entries independent navigation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const entry = {
    id: 'entry',
    name: 'Anna Beispiel',
    startNumber: '47',
    organizationCode: 'MSC-47',
    className: 'Tourenwagen',
    createdAt: '2026-11-13',
  };
  request.mockResolvedValue(
    Response.json({
      tasks: [
        {
          ...task('duplicatePerson', 'warning'),
          entry,
          className: entry.className,
          ageDays: 12,
          detail: {
            de: 'Doppelt mit Nennung #48: Geburtsdatum und E-Mail stimmen überein.',
            en: 'Duplicate entry.',
          },
          relatedEntries: [
            {
              ...entry,
              id: 'other',
              name: 'Anna Zweitnennung',
              startNumber: '48',
              fields: ['birthDate', 'email'],
            },
          ],
        },
      ],
      counts: { duplicatePerson: 1 },
      generation: 1,
    }),
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  await act(async () =>
    root.render(
      <WorkbasketOverview
        eventId="event"
        onOpenEntry={open}
        onOpenClass={vi.fn()}
      />,
    ),
  );
  try {
    expect(host.textContent).toContain('Anna Beispiel');
    expect(host.textContent).toContain('#47 · MSC-47 · Tourenwagen');
    expect(host.textContent).toContain('Seit 12 Tagen');
    expect(host.textContent).toContain('Doppelt mit Nennung #48');
    expect(host.textContent).not.toContain('Grund: duplicatePerson');
    expect(host.textContent).not.toContain('birthDate');
    expect(host.querySelector('ul > li')).not.toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Nennung Anna Beispiel öffnen"]',
        )!
        .click(),
    );
    expect(open).toHaveBeenLastCalledWith('entry');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Nennung Anna Zweitnennung öffnen"]',
        )!
        .click(),
    );
    expect(open).toHaveBeenLastCalledWith('other');
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('nav button')]
        .find((button) => button.textContent === 'Fehlende Unterlagen (0)')!
        .click(),
    );
    expect(host.textContent).toContain('Hier ist nichts zu tun');
  } finally {
    act(() => root.unmount());
  }
});

it('reports entry-open failures and permits retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  request.mockResolvedValue(
    Response.json({
      tasks: [task('ready', 'task')],
      counts: { ready: 1 },
      generation: 1,
    }),
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      <WorkbasketOverview
        eventId="event"
        onOpenEntry={open}
        onOpenClass={vi.fn()}
      />,
    ),
  );
  try {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Nennung öffnen"]')!
        .click(),
    );
    expect(host.textContent).toContain(
      'Die Nennung konnte nicht geöffnet werden',
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Nennung öffnen"]')!
        .click(),
    );
    expect(open).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain(
      'Die Nennung konnte nicht geöffnet werden',
    );
  } finally {
    act(() => root.unmount());
  }
});
