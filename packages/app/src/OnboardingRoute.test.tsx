// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('onboarding prototype route', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('opens in development builds without a session or runtime bootstrap', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.pushState({}, '', '/app/onboarding-preview');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));
    await vi.waitFor(() =>
      expect(container.querySelector('h1')?.textContent).toBe(
        'Wie willst du dich anmelden?',
      ),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
