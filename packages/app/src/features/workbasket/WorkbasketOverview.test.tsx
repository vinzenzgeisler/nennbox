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
    expect(host.textContent).toContain('Baujahr, Baujahr-Untergrenze');
    const select = host.querySelector('select')!;
    expect(select.textContent).toContain('Baujahr prüfen (1)');
    await act(async () => {
      select.value = 'year';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).not.toContain('Grund: ready');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === 'Nennung öffnen')!
        .click(),
    );
    expect(open).toHaveBeenCalledWith('entry');
    await act(async () => {
      select.value = 'capacityNear';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === 'Nennungen der Klasse öffnen')!
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
