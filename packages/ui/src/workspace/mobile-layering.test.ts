import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// jsdom has no layout engine; this guards the CSS contract of the bottom bar without a browser.
const src = new URL('..', import.meta.url).pathname;
const appSrc = new URL('../../../app/src', import.meta.url).pathname;
const css = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return css(path);
    return name.endsWith('.css') ? [path] : [];
  });
const tokens = readFileSync(join(src, 'tokens.css'), 'utf8');
const token = (name: string) =>
  Number(new RegExp(`--${name}:\\s*(\\d+)\\s*;`).exec(tokens)?.[1]);
const layer = (value: string) => {
  const name = /^var\(--(layer-[\w-]+)\)$/.exec(value)?.[1];
  return name ? token(name) : Number(value);
};
const zIndexes = [...css(src), ...css(appSrc)].flatMap((file) =>
  [
    ...readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/([^{}]+)\{[^{}]*?z-index:\s*([^;]+);/g),
  ].map((match) => ({
    selector: match[1]!.trim(),
    value: layer(match[2]!.trim()),
    file,
  })),
);
const read = (path: string) => readFileSync(join(src, path), 'utf8');

it('defines one ordered layer scale: content < sheet < bottom bar < toast < popover < modal', () => {
  const [sheet, bar, toast, popover, modal] = [
    'layer-sheet',
    'layer-bottom-nav',
    'layer-toast',
    'layer-popover',
    'layer-modal',
  ].map(token);
  expect(sheet).toBeLessThan(bar!);
  expect(bar).toBeLessThan(toast!);
  expect(toast).toBeLessThan(popover!);
  expect(popover).toBeLessThan(modal!);
});

it('keeps every in-content layer below the fixed bottom bar', () => {
  const bar = token('layer-bottom-nav');
  const bottomBar = zIndexes.find((entry) =>
    entry.selector.includes('.nb-admin-mobile-nav'),
  );
  expect(bottomBar?.value).toBe(bar);
  const above = [
    ...new Set(
      zIndexes
        .filter((entry) => entry.value >= bar)
        .flatMap((entry) =>
          entry.selector.split(',').map((item) => item.trim()),
        ),
    ),
  ].sort();
  // Only the bar itself, floating feedback, popovers and dialogs may reach the bar's layer or above.
  expect(above).toEqual([
    '.nb-admin-mobile-nav',
    '.nb-command-overlay',
    '.nb-entry-status-options',
    '.nb-menu-disclosure',
    '.nb-selection',
    '.nb-toast',
  ]);
});

it('reserves the bar height plus the safe area below the content and the preview sheet', () => {
  expect(tokens).toMatch(
    /--mobile-nav-clearance:\s*calc\(\s*var\(--mobile-nav-height\)\s*\+\s*env\(safe-area-inset-bottom/,
  );
  expect(read('workspace/admin-workspace.css')).toMatch(
    /padding-bottom:\s*var\(--mobile-nav-clearance\)/,
  );
  expect(read('workspace/workspace-split.css')).toMatch(
    /inset:\s*0 0 var\(--mobile-nav-clearance\)/,
  );
  expect(read('detail/detail-layout.css')).toMatch(
    /bottom:\s*var\(--mobile-nav-clearance\)/,
  );
  expect(read('workspace/admin-navigation.css')).toMatch(
    /min-height:\s*var\(--mobile-nav-height\)/,
  );
});

it('lifts floating feedback above the bottom bar on phones', () => {
  const workspace = read('workspace/admin-workspace.css');
  expect(workspace).toMatch(
    /\.nb-admin-workspace \.nb-selection[\s\S]*bottom:\s*calc\(var\(--mobile-nav-clearance\)/,
  );
});
