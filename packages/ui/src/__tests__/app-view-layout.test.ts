import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const view = read('../app-primitives/app-view.css');
const primitives = read('../app-primitives/app-primitives.css');
const checkbox = read('../app-primitives/app-checkbox.css');
const workspace = read('../workspace/admin-workspace.css');
const header = read('../page-header/page-header.css');
const rule = (css: string, selector: string) => {
  const start = css.indexOf(selector + ' {');
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('shared app view layout and control styles', () => {
  it('aligns views and page headers to one gutter without doubling the workspace inset', () => {
    expect(workspace).toContain('--nb-page-gutter: var(--nb-space-7)');
    expect(workspace).toContain('--nb-page-gutter: var(--nb-space-4)');
    expect(header).toContain('var(--nb-page-gutter, var(--nb-space-7))');
    expect(rule(view, '.nb-app-view')).toContain(
      'var(--nb-page-gutter, var(--nb-space-7)) - var(--nb-content-inset, 0px)',
    );
    expect(rule(view, '.nb-app-view .nb-app-view')).toContain(
      'padding-inline: 0',
    );
  });
  it('keeps short status sections top-aligned beside longer class occupancy sections', () => {
    expect(rule(view, '.nb-app-grid')).toContain('align-items: start');
    expect(rule(view, '.nb-app-section')).toContain('align-content: start');
  });
  it('ships the checkbox skin in the public stylesheet with inline labels and a selected state', () => {
    expect(read('../components.css')).toContain(
      "@import url('./app-primitives/app-checkbox.css')",
    );
    expect(rule(checkbox, '.nb-app-checkbox')).toContain(
      'display: inline-flex',
    );
    expect(rule(checkbox, '.nb-app-checkbox')).toContain('align-items: center');
    const box = rule(checkbox, '.nb-app-checkbox > span');
    expect(box).toContain('width: 16px');
    expect(box).toContain('height: 16px');
    expect(box).toContain('border-radius: 5px');
    expect(rule(checkbox, '.nb-app-checkbox input:checked + span')).toContain(
      'var(--nb-brand)',
    );
    expect(
      rule(checkbox, '.nb-app-checkbox input:checked + span::after'),
    ).toContain('var(--nb-bg)');
    expect(
      rule(checkbox, '.nb-app-checkbox input:focus-visible + span'),
    ).toContain('var(--nb-focus-ring)');
  });
  it('uses the shared 32px field skin and a pointer-transparent custom select arrow', () => {
    const field = rule(primitives, '.nb-app-field');
    expect(field).toContain('height: var(--nb-control-h)');
    expect(field).toContain('border-radius: var(--nb-radius-md)');
    expect(field).toContain('var(--nb-border-strong)');
    expect(rule(view, '.nb-app-select')).toContain('appearance: none');
    expect(rule(view, '.nb-app-select-control::after')).toContain(
      'pointer-events: none',
    );
  });
});
