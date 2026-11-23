import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// jsdom has no layout engine; this guards the compact-row contract against the real stylesheet.
const css = readFileSync(
  new URL('./app-controls.css', import.meta.url),
  'utf8',
);
const rule = (selector: string) =>
  new RegExp(
    `(?:^|\\n)${selector.replace(/[.[\]>+]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  ).exec(css)?.[1] ?? '';

it('sizes editor rows by the shared row height, not by their content or a fixed pad', () => {
  const summary = rule('.nb-app-editor-summary');
  expect(summary).toMatch(/min-height:\s*var\(--nb-row-h\)/);
  expect(summary).toMatch(/flex-wrap:\s*nowrap/);
  expect(summary).toMatch(/padding:\s*var\(--nb-space-2\)/);
});

it('keeps the description on one line on wide screens', () => {
  const description = rule('.nb-app-editor-description');
  expect(description).toMatch(/white-space:\s*nowrap/);
  expect(description).toMatch(/text-overflow:\s*ellipsis/);
  expect(description).toMatch(/min-width:\s*0/);
});

it('separates rows in a list with a hairline instead of a flex gap', () => {
  expect(rule('.nb-app-editor-list')).not.toMatch(/gap:/);
  expect(
    rule('.nb-app-editor-list > .nb-app-editor-row + .nb-app-editor-row'),
  ).toMatch(/border-top:/);
});

it('lets the row wrap on phones so it cannot widen the page', () => {
  const block = /@media \(width <= 640px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
  expect(block).toMatch(/flex-wrap:\s*wrap/);
});
