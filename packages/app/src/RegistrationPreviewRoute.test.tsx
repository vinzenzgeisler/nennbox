// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./AdminApplication.js', () => ({
  AuthenticatedAdmin: () => <h1>Admin route sentinel</h1>,
}));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  window.history.pushState({}, '', '/');
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function openRoute(
  dev: boolean,
  flag: string,
  path = '/app/registration-preview',
) {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  vi.stubEnv('VITE_REGISTRATION_PREVIEW', flag);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  window.history.pushState({}, '', path);
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { App } = await import('./App.js');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  await act(async () => {
    // Resolve the real lazy chunk inside act, including its first cold load.
    if (dev || flag === 'true') {
      await import('./features/registration-preview/RegistrationPreview.js');
    }
    root.render(<App />);
  });
  return { container, fetchSpy, act };
}

describe('registration preview route boundary', () => {
  it.each([
    [true, ''],
    [false, 'true'],
  ])(
    'opens without authentication or runtime bootstrap (DEV=%s, flag=%s)',
    async (dev, flag) => {
      const { container, fetchSpy, act } = await openRoute(dev, flag);
      await vi.waitFor(
        async () => {
          await act(async () => {});
          expect(container.querySelector('h1')?.textContent).toBe('Über dich');
        },
        { timeout: 5000 },
      );
      expect(
        container.querySelector('input[id="person.firstName"]'),
      ).not.toBeNull();
      expect(container.textContent).not.toContain('Admin route sentinel');
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'false', 'TRUE'])(
    'does not expose the prototype in production without the exact opt-in (%s)',
    async (flag) => {
      const { container, fetchSpy } = await openRoute(false, flag);
      expect(container.querySelector('h1')?.textContent).toBe(
        'Admin route sentinel',
      );
      expect(
        container.querySelector('input[id="person.firstName"]'),
      ).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('matches only the explicit prototype path, preserving other admin routes', async () => {
    const { container, fetchSpy } = await openRoute(
      true,
      'true',
      '/app/registration-preview/other',
    );
    expect(container.querySelector('h1')?.textContent).toBe(
      'Admin route sentinel',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
