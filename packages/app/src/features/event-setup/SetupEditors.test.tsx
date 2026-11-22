// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventSetupClasses } from './EventSetupClasses.js';
import { StartNumberRanges } from './StartNumberRanges.js';
import { initialState } from './eventSetupState.js';
import type { SetupDraft } from './eventSetupApi.js';
import type { Range } from './startNumberApi.js';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());
it('collapses saved classes, opens new classes and retains values while toggling', () => {
  function Classes() {
    const [draft, setDraft] = useState<SetupDraft>(() => ({
      ...initialState().draft,
      classes: [
        {
          id: 'class-one',
          name: 'Touring',
          code: 'T',
          fee: '25',
          vehicleType: 'car' as const,
        },
        { name: 'New', code: 'N', fee: '30', vehicleType: 'car' as const },
      ],
    }));
    return <EventSetupClasses draft={draft} setDraft={setDraft} busy={false} />;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Classes />));
  const toggles = host.querySelectorAll<HTMLButtonElement>('[aria-expanded]');
  expect(toggles[0]?.getAttribute('aria-expanded')).toBe('false');
  expect(toggles[1]?.getAttribute('aria-expanded')).toBe('true');
  act(() => toggles[0]!.click());
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="Startgeld in Euro"]',
    )?.value,
  ).toBe('25');
  act(() => toggles[0]!.click());
  act(() => toggles[0]!.click());
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="Klassenname"]')
      ?.value,
  ).toBe('Touring');
  act(() => root.unmount());
});
it('opens added number ranges immediately and keeps old ranges compact', () => {
  function Ranges() {
    const [ranges, setRanges] = useState<Range[]>([
      {
        id: 'range-one',
        classId: null,
        from: '1',
        to: '9',
        reserved: '7',
        mode: 'automatic',
      },
    ]);
    return (
      <StartNumberRanges ranges={ranges} classes={[]} onChange={setRanges} />
    );
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Ranges />));
  expect(
    host.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'),
  ).toBe('false');
  const add = [...host.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Nummernbereich hinzufügen'),
  )!;
  act(() => add.click());
  expect(
    host.querySelectorAll('[aria-expanded]')[1]?.getAttribute('aria-expanded'),
  ).toBe('true');
  act(() => host.querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="Reserviert (Komma-getrennt)"]',
    )?.value,
  ).toBe('7');
  act(() => root.unmount());
});
it('keeps an empty class editor open and reports required fields in the visible editor', () => {
  function Classes({ saved }: { saved: boolean }) {
    const [draft, setDraft] = useState<SetupDraft>(() => ({
      ...initialState().draft,
      classes: [
        {
          ...(saved ? { id: 'class-one' } : {}),
          name: '',
          code: '',
          fee: '',
          vehicleType: 'car' as const,
        },
      ],
    }));
    return (
      <form>
        <EventSetupClasses draft={draft} setDraft={setDraft} busy={false} />
      </form>
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const toggle = () =>
    host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
  const disclosure = () => host.querySelector('.nb-app-editor-disclosure');
  act(() => root.render(<Classes saved={false} />));
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  act(() => toggle().click());
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(disclosure()?.hasAttribute('inert')).toBe(false);
  expect(document.activeElement).toBe(
    host.querySelector('input[aria-label="Klassenname"]'),
  );
  act(() => root.unmount());

  const closedRoot = createRoot(host);
  act(() => closedRoot.render(<Classes saved />));
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  act(() => host.querySelector('form')!.requestSubmit());
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(disclosure()?.hasAttribute('inert')).toBe(false);
  expect(document.activeElement).toBe(
    host.querySelector('input[aria-label="Klassenname"]'),
  );
  act(() => closedRoot.unmount());
  host.remove();
});
