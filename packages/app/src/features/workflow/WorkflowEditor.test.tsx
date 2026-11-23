// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { WorkflowEditor } from './WorkflowEditor.js';
import { defaultWorkflow } from './AdminWorkflow.js';
import type { WorkflowEditorProps } from './WorkflowEditorProps.js';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
function mount(patch: Partial<WorkflowEditorProps> = {}) {
  const props: WorkflowEditorProps = {
    eventId: 'event-1',
    events: [{ id: 'event-1', name: 'Testveranstaltung' }],
    loading: false,
    workflow: defaultWorkflow,
    revision: { id: 'revision-1', version: 3, workflow: defaultWorkflow },
    updateStatus: vi.fn(),
    updateWorkflow: vi.fn(),
    updateTransition: vi.fn(),
    reason: '',
    setReason: vi.fn(),
    busy: false,
    save: vi.fn(async () => {}),
    message: '',
    ...patch,
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<WorkflowEditor {...props} />));
  return props;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function button(label: string, scope: ParentNode = host) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === label,
  )!;
}
function changeText(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      field,
      value,
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('preserves activation gating, reason hint and live feedback', () => {
  mount();
  expect(button('Ablauf prüfen und aktivieren').disabled).toBe(true);
  const field = host.querySelector<HTMLInputElement>(
    '[aria-label="Begründung für die Aktivierung"]',
  )!;
  expect(field.maxLength).toBe(1000);
  expect(
    document.getElementById(field.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toContain('Änderungsprotokoll');
  const props = mountReplacement({
    reason: 'Geprüfter Ablauf',
    message: 'Version 3 des Nennungsablaufs aktiviert.',
  });
  act(() => button('Ablauf prüfen und aktivieren').click());
  expect(props.save).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    'Version 3',
  );
});
function mountReplacement(patch: Partial<WorkflowEditorProps>) {
  act(() => root?.unmount());
  host.remove();
  return mount(patch);
}

it('keeps status edits, notification and role callbacks intact', () => {
  const props = mount();
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Status 1 bearbeiten"]')!
      .click(),
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Übergang 1 bearbeiten"]')!
      .click(),
  );
  changeText(
    host.querySelector<HTMLInputElement>('[aria-label="Status 1 Schlüssel"]')!,
    'submitted',
  );
  expect(props.updateStatus).toHaveBeenCalledWith(0, { key: 'submitted' });
  act(() =>
    host
      .querySelector<HTMLInputElement>(
        '[aria-label="Übergang 1 Fahrer benachrichtigen"]',
      )!
      .click(),
  );
  expect(props.updateTransition).toHaveBeenCalledWith(0, { notify: true });
  act(() =>
    host
      .querySelector<HTMLInputElement>(
        '[aria-label="Übergang 1 Rolle member"]',
      )!
      .click(),
  );
  expect(props.updateTransition).toHaveBeenCalledWith(0, { roles: ['member'] });
});

it('requires a reason before removing a status and its related transitions', () => {
  const props = mount();
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Status 1 bearbeiten"]')!
      .click(),
  );
  act(() => button('Status entfernen').click());
  const dialog = host.querySelector('dialog')!;
  expect(button('Status entfernen', dialog).disabled).toBe(true);
  changeText(dialog.querySelector('textarea')!, 'Nicht mehr benötigt');
  expect(button('Status entfernen', dialog).disabled).toBe(false);
  act(() => button('Status entfernen', dialog).click());
  expect(props.updateWorkflow).toHaveBeenCalledWith({
    ...defaultWorkflow,
    statuses: defaultWorkflow.statuses.slice(1),
    transitions: defaultWorkflow.transitions.filter(
      (edge) => edge.from !== 'pending' && edge.to !== 'pending',
    ),
  });
  act(() => button('Status entfernen').click());
  expect(dialog.querySelector('textarea')!.value).toBe('');
  expect(button('Status entfernen', dialog).disabled).toBe(true);
});

it('starts compact and opens newly added statuses and transitions', () => {
  const props = mount();
  expect(
    [...host.querySelectorAll('.nb-app-editor-summary')].every(
      (row) => row.getAttribute('aria-expanded') === 'false',
    ),
  ).toBe(true);
  act(() => button('Status hinzufügen').click());
  const withStatus = vi.mocked(props.updateWorkflow).mock.calls[0]![0];
  act(() => root!.render(<WorkflowEditor {...props} workflow={withStatus} />));
  expect(
    host
      .querySelector(
        '[aria-label="Status ' + withStatus.statuses.length + ' bearbeiten"]',
      )
      ?.getAttribute('aria-expanded'),
  ).toBe('true');
  act(() => button('Übergang hinzufügen').click());
  const withTransition = vi.mocked(props.updateWorkflow).mock.calls[1]![0];
  act(() =>
    root!.render(<WorkflowEditor {...props} workflow={withTransition} />),
  );
  expect(
    host
      .querySelector(
        '[aria-label="Übergang ' +
          withTransition.transitions.length +
          ' bearbeiten"]',
      )
      ?.getAttribute('aria-expanded'),
  ).toBe('true');
});

it('lists statuses by German name and category only; the English label lives in the editor', () => {
  mount();
  const summaries = [
    ...host.querySelectorAll<HTMLElement>('.nb-app-editor-summary'),
  ];
  const statusRows = summaries.filter((row) =>
    row.getAttribute('aria-label')?.startsWith('Status '),
  );
  for (const row of statusRows) {
    expect(row.textContent).not.toMatch(/Waitlisted|Accepted|Rejected|Pending/);
  }
  const vorauswahl = statusRows.find((row) =>
    row.textContent?.includes('Warteliste'),
  );
  expect(
    vorauswahl?.querySelector('.nb-app-editor-description')?.textContent,
  ).toBe('Warteliste');
  const english = host.querySelector<HTMLInputElement>(
    '[aria-label$="englische Bezeichnung"]',
  );
  expect(english).not.toBeNull();
});

it('renders status and transition rows inside a gap-free compact list', () => {
  mount();
  const lists = host.querySelectorAll('.nb-app-editor-list');
  expect(lists).toHaveLength(2);
  for (const list of lists)
    expect(list.querySelectorAll('.nb-app-editor-row').length).toBeGreaterThan(
      0,
    );
});
