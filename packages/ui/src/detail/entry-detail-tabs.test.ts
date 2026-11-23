import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps long detail tab labels unshrunk and exposes horizontal overflow', () => {
  // jsdom has no layout engine; guard the CSS contract without browser snapshots.
  const css = readFileSync(
    new URL('./entry-detail-page.css', import.meta.url),
    'utf8',
  );
  const tabs = css.match(/\.nb-entry-page-tabs\s*\{([^}]+)\}/)?.[1] ?? '';
  const buttons =
    css.match(/\.nb-entry-page-tabs button\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(tabs).toMatch(/overflow-x:\s*auto/);
  expect(tabs).toMatch(/scrollbar-width:\s*thin/);
  expect(buttons).toMatch(/flex:\s*0 0 auto/);
  expect(buttons).toMatch(/white-space:\s*nowrap/);
  expect(buttons).toMatch(/overflow:\s*visible/);
});
