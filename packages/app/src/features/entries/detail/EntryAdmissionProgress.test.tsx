// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { EntryAdmissionProgress } from './EntryAdmissionProgress.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
function mount(entry: Entry) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<EntryAdmissionProgress entry={entry} />));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function entryWith(requiredCount: number, uploadedRequiredCount: number) {
  return {
    statusProjection: {
      dimensions: [
        { key: 'payment', meaning: 'done' },
        { key: 'technical_inspection', meaning: 'missing' },
        { key: 'waiver', meaning: 'not_relevant' },
      ],
    },
    documentProjection: { requiredCount, uploadedRequiredCount },
  } as unknown as Entry;
}

it('counts done and not-required requirements and explains missing documents and on-site work', () => {
  mount(entryWith(3, 1));
  expect(host.textContent).toContain('2 von 4 erledigt · 2 Unterlagen fehlen');
  expect(
    [...host.querySelectorAll('li')].map((row) => [
      row.className,
      row.textContent,
    ]),
  ).toEqual([
    ['is-done', 'Startgeld bezahlt'],
    ['is-missing', 'Unterlagen 2 fehlen'],
    ['is-wait', 'Abnahme vor Ort'],
    ['is-not_relevant', 'Haftverzicht nicht erforderlich'],
  ]);
});

it('uses a singular missing-document summary', () => {
  mount(entryWith(2, 1));
  expect(host.textContent).toContain('1 Unterlage fehlt');
});

it.each([2, 3])(
  'does not show a missing-document warning once %i required uploads are present',
  (uploaded) => {
    mount(entryWith(2, uploaded));
    expect(host.textContent).toContain('3 von 4 erledigt');
    expect(host.textContent).not.toContain('Unterlage fehlt');
    expect(host.querySelectorAll('li')[1]?.textContent).toBe(
      'Unterlagen erledigt',
    );
  },
);

it('treats absent projections as not required rather than blockers', () => {
  mount({} as Entry);
  expect(host.textContent).toContain('4 von 4 erledigt');
  expect(
    [...host.querySelectorAll('li')].every(
      (row) => row.className === 'is-not_relevant',
    ),
  ).toBe(true);
});

it('does not require optional documents and explains unpaid and unsigned requirements', () => {
  mount({
    documentProjection: { requiredCount: 0, uploadedRequiredCount: 0 },
    statusProjection: {
      dimensions: [
        { key: 'payment', meaning: 'in_progress' },
        { key: 'technical_inspection', meaning: 'done' },
        { key: 'waiver', meaning: 'missing' },
      ],
    },
  } as unknown as Entry);
  expect(host.textContent).toContain('2 von 4 erledigt');
  expect(
    [...host.querySelectorAll('li')].map((row) => row.textContent),
  ).toEqual([
    'Startgeld fehlt',
    'Unterlagen nicht erforderlich',
    'Abnahme erledigt',
    'Haftverzicht fehlt',
  ]);
});
