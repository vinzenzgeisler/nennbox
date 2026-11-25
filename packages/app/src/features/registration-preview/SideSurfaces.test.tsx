// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SideSurfaces } from './SideSurfaces.js';
import { sideSurfaceOptions, surfaceCopy } from './surfaces.js';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});
describe('local arrival and return surfaces', () => {
  it.each(['de', 'en'] as const)(
    'renders every state in %s without network requests',
    (locale) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
      for (const option of sideSurfaceOptions) {
        act(() =>
          root!.render(
            <SideSurfaces
              surface={option.value}
              locale={locale}
              email="test@example.invalid"
              amount="110 €"
              onSurface={() => undefined}
              onResume={() => undefined}
            />,
          ),
        );
        expect(container.querySelector('h1')?.textContent).toBe(
          surfaceCopy[option.value]?.title[locale],
        );
        expect(container.textContent).toContain(
          locale === 'de' ? 'Lokale Simulation' : 'Local simulation',
        );
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
  );
  it('does not request payment or expose bank details before admission', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    for (const surface of ['confirmation', 'waitlist'] as const) {
      act(() =>
        root!.render(
          <SideSurfaces
            surface={surface}
            locale="de"
            email="test@example.invalid"
            amount="110 €"
            onSurface={() => undefined}
            onResume={() => undefined}
          />,
        ),
      );
      expect(container.textContent).toContain(
        'Bestätige jetzt deine E-Mail-Adresse',
      );
      expect(container.textContent).not.toContain('IBAN');
      expect(container.textContent).not.toContain('Jetzt online bezahlen');
    }
  });
});
