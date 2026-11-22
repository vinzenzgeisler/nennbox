// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AppDialog,
  AppActions,
  AppFileInput,
  AppSelectionList,
} from './AppControls.js';
import { AppButton, AppCheckbox } from './AppPrimitives.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

describe('app administration controls', () => {
  it('keeps file constraints and selections accessible and interactive', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const onFile = vi.fn();
    const onChoice = vi.fn();
    act(() =>
      root.render(
        <>
          <AppFileInput
            label="PDF hinzufügen"
            accept="application/pdf,.pdf"
            onChange={onFile}
          />
          <AppSelectionList label="Empfänger">
            <AppCheckbox label="Anja" onChange={onChoice} />
          </AppSelectionList>
        </>,
      ),
    );
    const file = host.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(file.getAttribute('aria-label')).toBe('PDF hinzufügen');
    expect(file.closest('label')?.textContent).toContain('Datei auswählen');
    expect(file.closest('label')?.textContent).toContain(
      'Keine Datei ausgewählt',
    );
    expect(file.accept).toBe('application/pdf,.pdf');
    expect(host.querySelector('[role=group]')?.getAttribute('aria-label')).toBe(
      'Empfänger',
    );
    act(() => {
      file.dispatchEvent(new Event('change', { bubbles: true }));
      host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    });
    expect(onFile).toHaveBeenCalledOnce();
    expect(onChoice).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
  it('uses an explicitly styled modal with the existing cancel and action contract', () => {
    const show = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: show,
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const onClose = vi.fn();
    const onSave = vi.fn();
    act(() =>
      root.render(
        <AppDialog
          open
          title="Moduleinstellungen"
          closeLabel="Schließen"
          onClose={onClose}
          actions={
            <AppActions>
              <AppButton tone="primary" onClick={onSave}>
                Modul speichern
              </AppButton>
            </AppActions>
          }
        >
          <AppFileInput label="PDF" disabled />
        </AppDialog>,
      ),
    );
    const dialog = host.querySelector('dialog')!;
    expect(dialog.classList.contains('nb-app-dialog')).toBe(true);
    expect(show).toHaveBeenCalledOnce();
    expect(host.querySelector('input')!.disabled).toBe(true);
    act(() => host.querySelector<HTMLButtonElement>('footer button')!.click());
    expect(onSave).toHaveBeenCalledOnce();
    act(() => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => root.unmount());
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
});
