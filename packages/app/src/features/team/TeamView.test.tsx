// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TeamView } from './TeamView.js';
import { adminFetch } from '../../auth.js';
vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
const snapshot = {
  members: [
    {
      id: 'a',
      displayName: 'Anna Admin',
      email: 'anna@example.org',
      role: 'admin',
      status: 'active',
      lastSignedInAt: null,
    },
    {
      id: 'b',
      displayName: 'Bea Büro',
      email: 'bea@example.org',
      role: 'office',
      status: 'active',
      lastSignedInAt: '2026-11-25T09:30:00Z',
    },
    {
      id: 'c',
      displayName: 'Clara',
      email: 'clara@example.org',
      role: 'viewer',
      status: 'disabled',
      lastSignedInAt: null,
    },
  ],
  invitations: [
    {
      id: 'i',
      email: 'neu@example.org',
      role: 'viewer',
      expiresAt: '2099-01-01T00:00:00Z',
      revokedAt: null,
      redeemedAt: null,
    },
  ],
  history: [
    {
      id: 'h',
      actorIssuer: 'oidc',
      actorSubject: 'anna',
      actorName: 'Anna Admin',
      action: 'invited',
      targetId: 'i',
      details: {},
      createdAt: '2026-11-25T09:00:00Z',
    },
  ],
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const click = async (label: string) =>
  act(async () => {
    const node = [...document.querySelectorAll('button')]
      .reverse()
      .find((node) => node.textContent === label);
    expect(node).toBeTruthy();
    node!.click();
  });
const mutations = () =>
  vi.mocked(adminFetch).mock.calls.filter(([, init]) => init?.method);
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(adminFetch).mockImplementation(async (_url, init) =>
    init?.method ? new Response(null, { status: 204 }) : json(snapshot),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<TeamView />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('shows names, roles, status, last login and invitation actor; protects the last administrator', () => {
  expect(container.textContent).toContain('Anna Admin');
  expect(container.textContent).toContain('Noch keine Anmeldung');
  expect(container.textContent).toContain('25.11.2026');
  expect(container.textContent).toContain('Eingeladen von Anna Admin');
  const admin = container.querySelector('li')!;
  expect(admin.textContent).toContain('Letzter aktiver Administrator');
  expect(admin.querySelector('button')).toBeNull();
});
it('describes all roles from the shared mapping and submits the invitation', async () => {
  await click('Person einladen');
  expect(document.body.textContent).toContain(
    'Bearbeitet technische Abnahme und Haftverzicht',
  );
  const input = document.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'new@example.org');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(mutations()[0]?.[0]).toBe('/admin/team/invitations');
  expect(JSON.parse(String(mutations()[0]?.[1]?.body))).toEqual({
    email: 'new@example.org',
    role: 'viewer',
  });
  expect(container.textContent).toContain('Einladung wurde gesendet.');
});
it('keeps invalid email API messages in the dialog without losing input', async () => {
  vi.mocked(adminFetch).mockResolvedValue(
    json(
      {
        error:
          'Bitte verwende eine E-Mail-Adresse mit ASCII-Zeichen vor dem @.',
      },
      400,
    ),
  );
  await click('Person einladen');
  await act(async () => {
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(document.body.textContent).toContain('ASCII-Zeichen');
  expect(document.querySelector('dialog')).not.toBeNull();
});
it('requires confirmation for deactivation and displays server conflict', async () => {
  await click('Deaktivieren');
  expect(mutations()).toHaveLength(0);
  expect(document.body.textContent).toContain('verliert sofort den Zugriff');
  vi.mocked(adminFetch).mockResolvedValue(
    json(
      { error: 'Mindestens ein aktiver Administrator muss im Team bleiben.' },
      409,
    ),
  );
  await click('Deaktivieren');
  expect(mutations()).toHaveLength(1);
  expect(document.body.textContent).toContain(
    'Mindestens ein aktiver Administrator',
  );
});
it('revokes only after confirmation and resends on request', async () => {
  await click('Widerrufen');
  expect(mutations()).toHaveLength(0);
  await click('Abbrechen');
  await click('Erneut senden');
  expect(mutations()[0]?.[0]).toBe('/admin/team/invitations/i/resend');
  await click('Widerrufen');
  await click('Widerrufen');
  expect(mutations()[1]?.[0]).toBe('/admin/team/invitations/i/revoke');
});
it('reactivates a disabled member and changes a role', async () => {
  await click('Reaktivieren');
  expect(JSON.parse(String(mutations()[0]?.[1]?.body))).toEqual({
    kind: 'status',
    status: 'active',
  });
  await click('Rolle ändern');
  const select = document.querySelector<HTMLSelectElement>('dialog select')!;
  await act(async () => {
    select.value = 'cashier';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Rolle speichern');
  expect(JSON.parse(String(mutations()[1]?.[1]?.body))).toEqual({
    kind: 'role',
    role: 'cashier',
  });
});
it('shows history with actor and date', async () => {
  await act(async () => {
    const select = container.querySelector('select')!;
    select.value = 'history';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.textContent).toContain('Einladung erstellt');
  expect(container.textContent).toContain('Anna Admin');
  expect(container.textContent).toContain('25.11.2026');
});
