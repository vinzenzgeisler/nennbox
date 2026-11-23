// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriverPortal } from './DriverPortal.js';
import type { View } from './driverPortalTypes.js';

const view: View = {
  eventName: 'Testfahrt',
  startsOn: '2027-05-01',
  endsOn: '2027-05-02',
  entries: ['one', 'two'].map((id) => ({
    id,
    driverName: 'Test Fahrer',
    className: 'Touring',
    status: 'accepted',
    startNumber: null,
    vehicle: 'Auto',
    documents: [],
  })),
  messages: [],
  payment: null,
  editableFields: ['phone', 'city'],
  contact: { phone: '123', city: 'Berlin' },
};
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  history.replaceState(null, '', '/fahrer#token=original-link');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<DriverPortal eventSlug="test" />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === text,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
describe('DriverPortal access', () => {
  it.each([400, 401, 403, 404, 410, 422, 429])(
    'classifies redeem %s as an invalid link',
    async (status) => {
      fetchMock.mockResolvedValue(response({}, status));
      await render();
      expect(container.textContent).toContain('Link nicht mehr gültig');
      expect(container.textContent).not.toContain('Technischer Fehler');
    },
  );
  it.each([500, 503, 'network'])(
    'preserves and retries the link after %s',
    async (failure) => {
      if (failure === 'network')
        fetchMock.mockRejectedValueOnce(new TypeError('offline'));
      else fetchMock.mockResolvedValueOnce(response({}, Number(failure)));
      fetchMock
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(response(view));
      await render();
      expect(container.textContent).toContain('Technischer Fehler');
      expect(location.hash).toBe('#token=original-link');
      await click('Erneut laden');
      expect(container.textContent).toContain('Testfahrt');
      expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
        token: 'original-link',
      });
      expect(location.hash).toBe('');
    },
  );
  it.each([401, 500, 'network'])(
    'retries only loading after successful redemption and load failure %s',
    async (failure) => {
      fetchMock.mockResolvedValueOnce(response({}));
      if (failure === 'network')
        fetchMock.mockRejectedValueOnce(new TypeError('offline'));
      else fetchMock.mockResolvedValueOnce(response({}, Number(failure)));
      fetchMock.mockResolvedValueOnce(response(view));
      await render();
      expect(container.textContent).toContain('Technischer Fehler');
      expect(container.textContent).not.toContain('Link nicht mehr gültig');
      await click('Erneut laden');
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/public/driver-portal/redeem',
        '/public/driver-portal',
        '/public/driver-portal',
      ]);
      expect(container.textContent).toContain('Testfahrt');
    },
  );
  it.each([404, 401])(
    'shows technical load failures without a token, but offers the request form for a missing session (%s)',
    async (missing) => {
      history.replaceState(null, '', '/fahrer');
      fetchMock
        .mockResolvedValueOnce(response({}, 503))
        .mockResolvedValueOnce(response({}, missing));
      await render();
      expect(container.textContent).toContain('Technischer Fehler');
      await click('Erneut laden');
      expect(container.textContent).toContain('Persönlichen Link anfordern');
      expect(container.textContent).not.toContain('Technischer Fehler');
      expect(container.querySelector('input[type="email"]')).not.toBeNull();
    },
  );
  it('shows the request form directly when the first visit has no session', async () => {
    history.replaceState(null, '', '/fahrer');
    fetchMock.mockResolvedValueOnce(
      response({ error: 'Link unavailable' }, 404),
    );
    await render();
    const label = [...container.querySelectorAll('label')].find((item) =>
      item.textContent?.includes('E-Mail-Adresse'),
    );
    expect(label).toBeDefined();
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Technischer Fehler');
  });
});

describe('shared driver contact corrections', () => {
  it('synchronizes forms, sends only changed fields, and keeps refreshed data when another form saves', async () => {
    let contact = { phone: '123', city: 'Berlin' };
    fetchMock.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/redeem')) return response({});
      if (options?.method === 'PATCH') {
        contact = { ...contact, ...JSON.parse(String(options.body)).fields };
        return response({});
      }
      return response({ ...view, contact });
    });
    await render();
    let forms = [...container.querySelectorAll<HTMLFormElement>('form')];
    expect(forms).toHaveLength(2);
    expect(
      [...container.querySelectorAll('button[type="submit"]')].every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
    await change(forms[0]!.querySelector('input')!, '456');
    expect(forms[1]!.querySelector('input')!.value).toBe('456');
    await act(async () =>
      forms[0]!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    forms = [...container.querySelectorAll<HTMLFormElement>('form')];
    expect(forms[1]!.querySelector('input')!.value).toBe('456');
    await change(forms[1]!.querySelectorAll('input')[1]!, 'Hamburg');
    await act(async () =>
      forms[1]!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    const patches = fetchMock.mock.calls.filter(
      ([, options]) => options?.method === 'PATCH',
    );
    expect(
      patches.map(([url, options]) => [url, JSON.parse(String(options!.body))]),
    ).toEqual([
      ['/public/driver-portal/entries/one', { fields: { phone: '456' } }],
      ['/public/driver-portal/entries/two', { fields: { city: 'Hamburg' } }],
    ]);
    expect(contact).toEqual({ phone: '456', city: 'Hamburg' });
    expect(forms[0]!.querySelectorAll('input')[1]!.value).toBe('Hamburg');
    // Reverting to the baseline must not send an empty patch.
    await change(forms[0]!.querySelector('input')!, '789');
    await change(forms[0]!.querySelector('input')!, '456');
    await act(async () =>
      forms[0]!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH'),
    ).toHaveLength(2);
  });
});
