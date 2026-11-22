// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { AdmissionProgress, EntryDetailPage } from './EntryDetailPage.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
function mount(element: React.ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it('renders named slots, selected section controls, and an accessible sidebar', () => {
  const onTab = vi.fn();
  const render = (activeTab: string) => (
    <EntryDetailPage
      navigation={<a href="/entries">Nennungen</a>}
      header={<h1>Alex Beispiel</h1>}
      progress={<p>2 von 4 erledigt</p>}
      tabs={[
        { key: 'overview', label: 'Übersicht' },
        { key: 'documents', label: 'Unterlagen', count: 0 },
        { key: 'messages', label: 'Nachrichten', count: 3 },
      ]}
      activeTab={activeTab}
      onTab={onTab}
      sidebar={<p>Interne Notiz</p>}
    >
      <p>Aktiver Inhalt</p>
    </EntryDetailPage>
  );
  mount(render('overview'));
  expect(host.querySelector('h1')?.textContent).toBe('Alex Beispiel');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/entries');
  expect(host.textContent).toContain('2 von 4 erledigt');
  expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe(
    'Eigenschaften und interne Notiz',
  );
  expect(host.querySelector('aside')?.textContent).toBe('Interne Notiz');
  const nav = host.querySelector('nav')!;
  expect(nav.getAttribute('aria-label')).toBe('Bereiche der Nennung');
  const buttons = [...nav.querySelectorAll('button')];
  expect(buttons.map((button) => button.textContent)).toEqual([
    'Übersicht',
    'Unterlagen0',
    'Nachrichten3',
  ]);
  expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
    'true',
    'false',
    'false',
  ]);
  const content = document.getElementById(
    buttons[0]!.getAttribute('aria-controls')!,
  );
  expect(content?.textContent).toBe('Aktiver Inhalt');
  expect(
    buttons.every(
      (button) => button.getAttribute('aria-controls') === content?.id,
    ),
  ).toBe(true);
  act(() => buttons[1]!.click());
  expect(onTab).toHaveBeenCalledWith('documents');
  act(() => root!.render(render('documents')));
  expect(nav.querySelectorAll('button')[1]?.getAttribute('aria-pressed')).toBe(
    'true',
  );
});

it('gives separate detail pages independent content targets', () => {
  const page = (title: string) => (
    <EntryDetailPage
      navigation={null}
      header={title}
      progress={null}
      tabs={[{ key: 'overview', label: 'Übersicht' }]}
      activeTab="overview"
      onTab={vi.fn()}
      sidebar={null}
    >
      {title} Inhalt
    </EntryDetailPage>
  );
  mount(
    <>
      {page('Eins')}
      {page('Zwei')}
    </>,
  );
  const targets = [...host.querySelectorAll('button')].map((button) =>
    button.getAttribute('aria-controls'),
  );
  expect(new Set(targets).size).toBe(2);
  expect(
    targets.map((id) => document.getElementById(id!)?.textContent),
  ).toEqual(['Eins Inhalt', 'Zwei Inhalt']);
});

it('preserves admission order and exposes every state and its explanation', () => {
  mount(
    <AdmissionProgress
      summary="2 von 4 erledigt"
      items={[
        { label: 'Startgeld', state: 'done', detail: 'bezahlt' },
        { label: 'Unterlagen', state: 'missing', detail: '1 fehlt' },
        { label: 'Abnahme', state: 'wait', detail: 'vor Ort' },
        {
          label: 'Haftverzicht',
          state: 'not_relevant',
          detail: 'nicht erforderlich',
        },
      ]}
    />,
  );
  expect(host.querySelector('section')?.getAttribute('aria-label')).toBe(
    'Bis zur Zulassung',
  );
  expect(host.textContent).toContain('2 von 4 erledigt');
  const rows = [...host.querySelectorAll('ol li')];
  expect(rows.map((row) => row.className)).toEqual([
    'is-done',
    'is-missing',
    'is-wait',
    'is-not_relevant',
  ]);
  expect(rows.map((row) => row.textContent)).toEqual([
    'Startgeld bezahlt',
    'Unterlagen 1 fehlt',
    'Abnahme vor Ort',
    'Haftverzicht nicht erforderlich',
  ]);
  expect(
    rows.every(
      (row) => row.querySelector('i')?.getAttribute('aria-hidden') === 'true',
    ),
  ).toBe(true);
});
