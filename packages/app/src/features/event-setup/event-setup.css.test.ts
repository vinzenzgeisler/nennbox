import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./event-setup.css', import.meta.url), 'utf8');

it('lays the header action next to the intro and lets it wrap on phones', () => {
  const rule = /\.nb-event-setup-head\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(rule).toMatch(/display:\s*flex/);
  expect(rule).toMatch(/flex-wrap:\s*wrap/);
  expect(rule).toMatch(/justify-content:\s*space-between/);
});
