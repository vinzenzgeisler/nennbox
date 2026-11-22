// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppConfirmAction } from './AppConfirmAction.js';
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
it('blocks a blank reason, cancels without acting and resets the next confirmation', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const confirm = vi.fn();
  act(() =>
    root.render(
      <AppConfirmAction
        onConfirm={confirm}
        confirmation={{
          title: 'Entfernen?',
          message: 'Diese Aktion entfernt den Status.',
          reasonLabel: 'Grund',
          cancelLabel: 'Abbrechen',
          confirmLabel: 'Status entfernen',
          closeLabel: 'Schließen',
        }}
      >
        Status entfernen
      </AppConfirmAction>,
    ),
  );
  const trigger = host.querySelector('button')!;
  const field = host.querySelector('textarea')!;
  const submit = host.querySelector<HTMLButtonElement>(
    'footer button:last-child',
  )!;
  function input(value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  act(() => trigger.click());
  input('   ');
  expect(submit.disabled).toBe(true);
  input('Nicht mehr benötigt');
  expect(submit.disabled).toBe(false);
  act(() => host.querySelector<HTMLButtonElement>('footer button')!.click());
  expect(confirm).not.toHaveBeenCalled();
  expect(field.value).toBe('');
  act(() => trigger.click());
  input('Nicht mehr benötigt');
  act(() => submit.click());
  expect(confirm).toHaveBeenCalledOnce();
  expect(field.value).toBe('');
  expect(submit.disabled).toBe(true);
  act(() => root.unmount());
});
