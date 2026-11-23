import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// jsdom has no layout engine. A tab row that is wider than the phone stretches the layout
// viewport, and the fixed bottom bar then sits outside the visible area. Guard the CSS contract.
const src = new URL('..', import.meta.url).pathname;
const appSrc = new URL('../../../app/src', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(src, path), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const body = (file: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `(?:^|[},\\s])${escaped}\\s*\\{([^}]*)\\}`,
    'm',
  ).exec(strip(read(file)));
  expect(match, `${selector} in ${file}`).not.toBeNull();
  return match![1]!;
};
const allCss = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return allCss(path);
    return name.endsWith('.css') ? [path] : [];
  });

it('lets the shared tab list swipe inside its container instead of widening it', () => {
  const rule = body('tabs/tabs.css', '.nb-tab-list');
  expect(rule).toMatch(/overflow-x:\s*auto/);
  expect(rule).toMatch(/max-width:\s*100%/);
  expect(rule).toMatch(/min-width:\s*0/);
  expect(rule).toMatch(/scrollbar-width:\s*none/);
  expect(rule).toMatch(/-webkit-overflow-scrolling:\s*touch/);
  expect(body('tabs/tabs.css', ".nb-tab-list [role='tab']")).toMatch(
    /flex:\s*none/,
  );
});

it('keeps the status tabs of the entry list within the filter bar', () => {
  const css = 'workspace/workspace-split.css';
  const list = body(css, '.nb-workspace-split-filters .nb-tab-list');
  expect(list).toMatch(/display:\s*flex/);
  expect(list).not.toMatch(/inline-flex/);
  expect(list).toMatch(/width:\s*fit-content/);
  const parents = strip(read(css)).match(
    /\.nb-workspace-split-filters \.nb-filter-bar,\s*\.nb-workspace-split-filters \.nb-filter-bar-tabs\s*\{([^}]*)\}/,
  );
  expect(parents?.[1]).toMatch(/min-width:\s*0/);
  expect(parents?.[1]).toMatch(/max-width:\s*100%/);
});

it('keeps the detail tabs scrollable and their ancestors shrinkable', () => {
  const css = 'detail/entry-detail-page.css';
  const tabs = body(css, '.nb-entry-page-tabs');
  expect(tabs).toMatch(/overflow-x:\s*auto/);
  expect(tabs).toMatch(/min-width:\s*0/);
  expect(tabs).toMatch(/-webkit-overflow-scrolling:\s*touch/);
  for (const selector of ['.nb-entry-page', '.nb-entry-page-head']) {
    expect(body(css, selector)).toMatch(/min-width:\s*0/);
    expect(body(css, selector)).toMatch(/max-width:\s*100%/);
  }
});

it('lets the workspace body shrink and scrolls wide tables inside their own container', () => {
  const workspace = strip(read('workspace/admin-workspace.css'));
  expect(workspace).toMatch(
    /\.nb-admin-workspace-body,\s*\.nb-admin-workspace-main\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/,
  );
  const scroll = body('app-primitives/app-view.css', '.nb-app-table-scroll');
  expect(scroll).toMatch(/overflow-x:\s*auto/);
  expect(scroll).toMatch(/min-width:\s*0/);
});

it('never hides page-level horizontal overflow instead of fixing its source', () => {
  for (const file of [...allCss(src), ...allCss(appSrc)]) {
    const css = strip(readFileSync(file, 'utf8'));
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/overflow(-x)?:\s*(hidden|clip)/.test(rule[2]!)) continue;
      expect(
        rule[1]!.trim(),
        `${file} hides overflow on a page-level element`,
      ).not.toMatch(
        /(^|[\s,])(html|body|\.nb-admin-workspace(-body|-main)?)\s*($|,)/,
      );
    }
  }
});
