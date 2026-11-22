import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AppButton,
  AppCheckbox,
  AppProgressDots,
  AppStatusPill,
} from './AppPrimitives.js';

describe('app design primitives', () => {
  it('exposes status and completion meaning as text to assistive technology', () => {
    const status = renderToStaticMarkup(
      <AppStatusPill status="zu">Zugelassen</AppStatusPill>,
    );
    const dots = renderToStaticMarkup(
      <AppProgressDots
        states={['ok', 'missing', 'waiting', 'na']}
        label="1 von 4 erledigt"
      />,
    );
    expect(status).toContain('Zugelassen');
    expect(status).toContain('nb-app-status-zu');
    expect(dots).toContain('aria-label="1 von 4 erledigt"');
  });
  it('keeps actions and checkbox native and labeled', () => {
    expect(renderToStaticMarkup(<AppButton>Öffnen</AppButton>)).toContain(
      'type="button"',
    );
    expect(renderToStaticMarkup(<AppCheckbox label="Auswählen" />)).toContain(
      'type="checkbox"',
    );
  });
});
