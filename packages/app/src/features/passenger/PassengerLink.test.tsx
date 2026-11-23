// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassengerLink } from './PassengerLink.js';
import type { PassengerLinkView } from '@nennbox/contracts';

const view: PassengerLinkView = {
  eventName: 'Testfahrt',
  className: 'Touring',
  driverName: 'Test Fahrer',
  language: 'de',
  passenger: {
    firstName: 'Max',
    lastName: 'Mustermann',
    email: null,
    dateOfBirth: null,
    country: null,
    phone: null,
    street: null,
    postalCode: null,
    city: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
  },
  terms: [],
  expiresAt: '2027-05-01T00:00:00Z',
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
  history.replaceState(null, '', '/beifahrer?token=original-link');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (locale = 'de') => {
  await act(async () => root.render(<PassengerLink locale={locale} />));
};
describe('PassengerLink resolution', () => {
  it.each([400, 401, 403, 404, 410, 422, 429])(
    'classifies resolve %s as invalid/expired/used',
    async (status) => {
      fetchMock.mockResolvedValue(response({}, status));
      await render();
      expect(container.textContent).toContain(
        'ungültig, abgelaufen oder wurde bereits verwendet',
      );
      expect(container.querySelector('button')).toBeNull();
    },
  );
  it.each([500, 503, 'network', 'malformed', 'invalid-schema'])(
    'retries technical error %s using the original link',
    async (failure) => {
      if (failure === 'network')
        fetchMock.mockRejectedValueOnce(new TypeError('offline'));
      else if (failure === 'malformed')
        fetchMock.mockResolvedValueOnce(new Response('not-json'));
      else if (failure === 'invalid-schema')
        fetchMock.mockResolvedValueOnce(response({}));
      else fetchMock.mockResolvedValueOnce(response({}, Number(failure)));
      fetchMock.mockResolvedValueOnce(response(view));
      await render();
      expect(container.textContent).toContain('Technischer Fehler');
      expect(container.textContent).not.toContain('ungültig');
      expect(location.search).toBe('?token=original-link');
      const retry = container.querySelector('button');
      expect(retry?.textContent).toBe('Erneut laden');
      await act(async () => retry!.click());
      expect(container.textContent).toContain('Test Fahrer');
      expect(fetchMock.mock.calls).toHaveLength(2);
      for (const [, options] of fetchMock.mock.calls)
        expect(JSON.parse(String(options!.body))).toEqual({
          token: 'original-link',
        });
    },
  );
  it('localizes the technical error and retry action', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await render('en');
    expect(container.textContent).toContain('Technical error');
    expect(container.querySelector('button')?.textContent).toBe('Reload');
  });
  it('treats missing tokens as unavailable without a request', async () => {
    history.replaceState(null, '', '/beifahrer');
    await render();
    expect(container.textContent).toContain('ungültig');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
