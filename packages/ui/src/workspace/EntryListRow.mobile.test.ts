import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// jsdom has no layout engine; this guards the CSS contract of the phone row against the real stylesheet.
const css = readFileSync(
  new URL('./entry-list-row.css', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');
const start = css.indexOf('@media (width <= 860px)');
const narrow = css.slice(start, css.indexOf('\n}\n', start));
const rules = [...narrow.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1]!.trim(),
  body: match[2]!,
}));
const rule = (selector: string) =>
  rules.find((entry) => entry.selector === selector)?.body ?? '';
const cell = (column: string) =>
  rule(`.nb-entry-list-row td[data-column='${column}']`);

it('has a narrow-width block for the entry row', () => {
  expect(start).toBeGreaterThan(-1);
  expect(rules.length).toBeGreaterThan(4);
});

it('never takes status or completion out of the grid flow on narrow widths', () => {
  expect(narrow).not.toMatch(/position:\s*(absolute|fixed)/);
});

it('gives every visible cell an explicit track so none falls into the checkbox column', () => {
  for (const column of ['selection', 'person', 'status', 'completion']) {
    expect(cell(column), column).toMatch(/grid-column:/);
    expect(cell(column), column).toMatch(/grid-row:/);
  }
});

it('places status and completion side by side below the name line, in different columns', () => {
  const column = (name: string) =>
    /grid-column:\s*(\d+)\s*;/.exec(cell(name))?.[1];
  const row = (name: string) => /grid-row:\s*(\d+)\s*;/.exec(cell(name))?.[1];
  expect(row('person')).toBe('1');
  expect(row('status')).toBe('2');
  expect(row('completion')).toBe('2');
  expect(column('status')).not.toBe(column('completion'));
  expect(column('status')).not.toBe('1');
  expect(column('completion')).not.toBe('1');
  expect(rule('.nb-entry-list-row')).toMatch(/column-gap:\s*var\(--nb-space-/);
});

it('keeps the always-visible checkbox from changing the row height', () => {
  expect(cell('selection')).toMatch(/(^|\s)height:\s*0;/);
  expect(rule('.nb-entry-list-select')).toMatch(/opacity:\s*1/);
});
