// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminModules } from './AdminModules.js';

const item = {
  id: 'example.noop',
  version: '1.0.0',
  displayName: 'No-op',
  description: '',
  gallery: {
    name: { de: 'Modul', en: 'Module' },
    shortDescription: { de: 'Kurz', en: 'Short' },
    longDescription: { de: 'Lang', en: 'Long' },
    category: 'other',
    icon: 'puzzle',
    source: 'official',
    editions: ['community', 'cloud'],
    entitlement: 'included',
  },
  dependencies: [],
  enabled: false,
  entitled: true,
  configValid: true,
  available: true,
  status: 'available',
  unavailableReason: null,
  config: { label: 'default' },
  configSchema: {
    type: 'object',
    properties: { label: { type: 'string', title: 'Label' } },
    required: ['label'],
  },
  stateVersion: null,
  updatedAt: null,
  updatedBy: null,
};

describe('AdminModules', () => {
  it('activates, configures and confirms a data-preserving deactivation', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const originalFetch = globalThis.fetch;
    let current: Record<string, unknown> = { ...item };
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (String(_input) === '/admin/events')
          return new Response('[]', { status: 200 });
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as {
            enabled?: boolean;
            config?: unknown;
          };
          current = {
            ...current,
            enabled: body.enabled ?? current.enabled,
            config: body.config ?? current.config,
          };
          return new Response(JSON.stringify(current), { status: 200 });
        }
        return new Response(JSON.stringify({ modules: [current] }), {
          status: 200,
        });
      },
    );
    globalThis.fetch = fetch;
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<AdminModules />);
      });
      for (
        let i = 0;
        i < 50 &&
        ![...container.querySelectorAll('button')].some(
          (button) => button.textContent === 'Aktivieren',
        );
        i++
      ) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      }
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Aktivieren')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' &&
            String(init.body).includes('"enabled":true'),
        ),
      ).toBe(true);
      for (
        let i = 0;
        i < 50 &&
        ![...container.querySelectorAll('button')].some(
          (button) => button.textContent === 'Details',
        );
        i++
      ) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      }
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Details')
          ?.click();
      });
      for (
        let i = 0;
        i < 50 && !container.querySelector('input[type="text"]');
        i++
      ) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      }
      const textarea = container.querySelector('input[type="text"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          textarea.ownerDocument.defaultView!.HTMLInputElement.prototype,
          'value',
        )?.set?.call(textarea, 'changed');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Speichern')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' && String(init.body).includes('"config"'),
        ),
      ).toBe(true);
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((button) => button.textContent === 'Deaktivieren')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(container.querySelector('dialog')?.textContent).toContain(
        'erhalten',
      );
      const reason = container.querySelector('textarea')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          reason.ownerDocument.defaultView!.HTMLTextAreaElement.prototype,
          'value',
        )?.set?.call(reason, 'Daten bleiben erhalten');
        reason.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        [...container.querySelectorAll<HTMLButtonElement>('dialog button')]
          .find((button) => button.textContent === 'Deaktivieren')
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' &&
            String(init.body).includes('"enabled":false') &&
            String(init.body).includes('"reason":"Daten bleiben erhalten"'),
        ),
      ).toBe(true);
    } finally {
      act(() => root.unmount());
      globalThis.fetch = originalFetch;
      (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = false;
      vi.restoreAllMocks();
    }
  });
});

describe('module scope request ownership', () => {
  it('ignores old organization and event responses after switching scopes', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const original = globalThis.fetch;
    const pending = new Map<string, (response: Response) => void>();
    const eventIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    globalThis.fetch = vi.fn(async (input) => {
      const path = String(input);
      if (path === '/admin/events')
        return Response.json(
          eventIds.map((id, i) => ({
            id,
            organizationId: eventIds[0],
            name: `Event ${i}`,
            slug: `event-${i}`,
            startsOn: '2026-01-01',
            endsOn: '2026-01-01',
            status: 'draft',
          })),
        );
      return new Promise<Response>((resolve) => pending.set(path, resolve));
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    const tick = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      });
    const reply = (name: string) =>
      Response.json({
        modules: [
          {
            ...item,
            gallery: { ...item.gallery, name: { de: name, en: name } },
          },
        ],
      });
    try {
      await act(async () => root.render(<AdminModules />));
      await tick();
      await act(async () =>
        [...host.querySelectorAll('button')]
          .find((button) => button.textContent === 'Veranstaltung')!
          .click(),
      );
      await tick();
      const select = [...host.querySelectorAll('select')].find(
        (node) => node.options.length === 2,
      )!;
      await act(async () => {
        select.value = eventIds[1]!;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await tick();
      await act(async () =>
        pending.get(`/admin/events/${eventIds[1]}/modules`)!(
          reply('Current event'),
        ),
      );
      expect(host.textContent).toContain('Current event');
      await act(async () => {
        pending.get('/admin/organization/modules')!(
          reply('Stale organization'),
        );
        pending.get(`/admin/events/${eventIds[0]}/modules`)!(
          reply('Stale event'),
        );
      });
      expect(host.textContent).toContain('Current event');
      expect(host.textContent).not.toContain('Stale');
    } finally {
      act(() => root.unmount());
      globalThis.fetch = original;
      (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = false;
    }
  });
});
