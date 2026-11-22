// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppEditorRow, AppWorkflowPill } from './AppEditorRow.js';
import { AppTextInput } from './AppView.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

it('toggles an accessible editor and retains unsaved values when collapsed', () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <AppEditorRow
        label="Status bearbeiten"
        preview={<AppWorkflowPill label="Offen" color="#64748b" />}
        description="Open · Offen"
        open={open}
        onToggle={() => setOpen(!open)}
      >
        <AppTextInput label="Schlüssel" defaultValue="pending" />
      </AppEditorRow>
    );
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Example />));
  const button = host.querySelector('button')!;
  const disclosure = host.querySelector('.nb-app-editor-disclosure')!;
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(disclosure.hasAttribute('inert')).toBe(true);
  expect(host.querySelector('.nb-app-editor-content')?.id).toBe(
    button.getAttribute('aria-controls'),
  );
  expect(
    host.querySelector<HTMLElement>('.nb-app-workflow-pill i')?.style
      .backgroundColor,
  ).toBe('rgb(100, 116, 139)');
  act(() => button.click());
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(disclosure.hasAttribute('inert')).toBe(false);
  host.querySelector('input')!.value = 'changed';
  act(() => button.click());
  act(() => button.click());
  expect(host.querySelector('input')!.value).toBe('changed');
  act(() => root.unmount());
});

function InvalidEditorForm({ initiallyOpen }: { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <form>
      <AppEditorRow
        label="Klasse bearbeiten"
        preview="Neue Klasse"
        open={open}
        onToggle={() => setOpen(!open)}
      >
        <AppTextInput required label="Klassenname" defaultValue="" />
        <AppTextInput required label="Kürzel" defaultValue="" />
      </AppEditorRow>
      <button type="submit">Speichern</button>
    </form>
  );
}

it('does not collapse an editor that still has invalid required fields', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<InvalidEditorForm initiallyOpen />));
  const toggle = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
  act(() => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(
    host.querySelector('.nb-app-editor-disclosure')?.hasAttribute('inert'),
  ).toBe(false);
  expect(document.activeElement).toBe(host.querySelector('input'));
  act(() => root.unmount());
  host.remove();
});

it('reopens a closed editor and focuses its first invalid field on submit', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<InvalidEditorForm initiallyOpen={false} />));
  const toggle = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  act(() => host.querySelector('form')!.requestSubmit());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(
    host.querySelector('.nb-app-editor-disclosure')?.hasAttribute('inert'),
  ).toBe(false);
  expect(document.activeElement).toBe(host.querySelector('input'));
  act(() => root.unmount());
  host.remove();
});
