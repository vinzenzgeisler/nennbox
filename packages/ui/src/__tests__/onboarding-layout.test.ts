import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../onboarding/onboarding-shell.css', import.meta.url),
  'utf8',
);
const emerging = readFileSync(
  new URL('../onboarding/emerging.css', import.meta.url),
  'utf8',
);
const hints = readFileSync(
  new URL('../status/status.css', import.meta.url),
  'utf8',
);
const rule = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf('}', start));
};

describe('onboarding scroll ownership', () => {
  it('bounds the frame to the viewport and gives scrolling only to the middle content', () => {
    expect(rule(css, '.nb-onb')).toContain('height: 100dvh;');
    expect(rule(css, '.nb-onb')).not.toContain('min-height: 100dvh;');
    expect(rule(css, '.nb-onb')).toContain('overflow: hidden;');
    for (const selector of [
      '.nb-onb-frame',
      '.nb-onb-main',
      '.nb-onb-scroll',
    ]) {
      expect(rule(css, selector)).toContain('min-height: 0;');
    }
    expect(rule(css, '.nb-onb-scroll')).toContain('overflow-y: auto;');
    expect(rule(css, '.nb-onb-top')).toContain('flex: none;');
    expect(rule(css, '.nb-onb-dock')).toContain('flex: none;');
    expect(rule(emerging, '.nb-emerging')).toContain('overflow-y: auto;');
    expect(rule(css, '.nb-onb-content')).toContain(
      'justify-content: safe center;',
    );
    expect(rule(css, '.nb-onb.is-wide .nb-onb-content')).toContain(
      'max-width: 1120px;',
    );
  });
  it('animates only explicitly changed rows for 1.5 seconds', () => {
    expect(rule(emerging, '.nb-emerging-row')).toContain('animation: none;');
    expect(rule(emerging, '.nb-emerging-row.is-changed')).toContain('1500ms');
    expect(emerging).not.toContain('.is-armed');
  });
  it('renders shared hints as quiet text without keyboard-cap styling', () => {
    const hint = rule(hints, '.nb-hint');
    expect(hint).toContain('var(--nb-fg-muted, var(--color-graphite))');
    expect(hint).toContain('var(--nb-font, var(--font-plex))');
    expect(hint).not.toMatch(/border:|background:|--font-mono/);
    expect(hints).not.toContain('.nb-status,');
  });
});
