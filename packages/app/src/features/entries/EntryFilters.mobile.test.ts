import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./filters.css', import.meta.url), 'utf8');

it('gives the search the full first line on phones so filter and sort share the second', () => {
  const block = /@media \(width <= 640px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
  expect(block).toMatch(
    /\.nb-entry-search\s*\{[^}]*flex:\s*1 0 100%;[^}]*max-width:\s*none;/,
  );
  // Sort stays pushed to the end of the filter line instead of wrapping on its own.
  expect(css).toMatch(/\.nb-entry-sort\s*\{[^}]*margin-left:\s*auto;/);
});
