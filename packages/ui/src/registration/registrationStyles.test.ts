import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * "Was der Ton nie färbt" (P7) and "Was kein Thema ändern kann" (P8/themen.json
 * `unveraenderlich`) pinned against the actual stylesheets.
 */
const directory = dirname(fileURLToPath(import.meta.url));
const sheets = readdirSync(directory)
  .filter((file) => file.endsWith('.css'))
  .map((file) => [file, readFileSync(join(directory, file), 'utf8')] as const);

type Rule = { selector: string; body: string; file: string };
const rules: Rule[] = sheets.flatMap(([file, css]) =>
  [
    ...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].map((match) => ({
    selector: match[1]!.trim().replace(/\s+/g, ' '),
    body: match[2]!,
    file,
  })),
);
const declarations = rules.flatMap((rule) =>
  rule.body
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(':');
      return {
        ...rule,
        property: line.slice(0, at).trim(),
        value: line.slice(at + 1).trim(),
      };
    }),
);
const accentUses = declarations.filter((d) => /var\(--ak/.test(d.value));
const status = /(is-error|is-warning|is-success|has-error|-error\b)/;

describe('registration accent is limited to the seven allowed roles', () => {
  it('uses the accent variables at all', () => {
    expect(accentUses.length).toBeGreaterThan(10);
  });

  it('never paints body text, field text or page background with the accent', () => {
    for (const use of accentUses) {
      if (use.property === 'color')
        expect(use.value, `${use.selector}`).toMatch(
          /var\(--ak-(fg|auf|link)\b/,
        );
      if (use.property === 'background' || use.property === 'background-color')
        expect(use.value, `${use.selector}`).toMatch(
          /var\(--ak(?:-fl|-h|-a)?\b/,
        );
      // Page background and field/card surfaces stay neutral.
      expect(use.selector, use.value).not.toMatch(/^(html|body)\b/);
      expect(use.selector, use.value).not.toMatch(
        /nb-reg-field (input|textarea|select)$/,
      );
    }
  });

  it('only uses the accent for borders on selection, focus and the colour band', () => {
    const borders = accentUses.filter((d) =>
      /^(border|box-shadow|outline)/.test(d.property),
    );
    for (const use of borders)
      expect(use.value, `${use.file} ${use.selector}`).toMatch(
        /var\(--ak(?:-ring|-rd)?\b/,
      );
  });

  it('never lets the accent reach a status, error, warning or success rule', () => {
    for (const use of accentUses)
      expect(use.selector, `${use.property}: ${use.value}`).not.toMatch(status);
    for (const rule of rules.filter((r) => status.test(r.selector)))
      expect(rule.body, rule.selector).not.toContain('--ak');
  });

  it('keeps the four notice variants distinct; only the first carries the accent', () => {
    const notice = (variant: string) =>
      rules.find((r) => r.selector === `.nb-reg-notice.is-${variant}`)!;
    for (const variant of ['warning', 'error', 'success'])
      expect(notice(variant).body).toMatch(/#[0-9a-f]{6}/i);
    const base = rules.find((r) => r.selector === '.nb-reg-notice')!;
    expect(base.body).toContain('var(--ak-fl');
  });

  it('keeps the progress and upload result separate: bar may be accented, result may not', () => {
    const result = rules.filter((r) =>
      /nb-reg-upload.*(is-success|is-error)/.test(r.selector),
    );
    for (const rule of result) expect(rule.body).not.toContain('--ak');
  });
});

describe('hit areas and density', () => {
  it('keeps every interactive preview control at least 44 px high', () => {
    for (const selector of [
      '.nb-preview .nb-app-btn',
      '.nb-preview .nb-choice',
      '.nb-reg-option',
      '.nb-reg-step',
    ]) {
      const heights = declarations.filter(
        (d) => d.selector === selector && d.property === 'min-height',
      );
      expect(heights.length, selector).toBeGreaterThan(0);
      for (const height of heights)
        expect(parseFloat(height.value), selector).toBeGreaterThanOrEqual(44);
    }
  });

  it('density only changes spacing through --preview-space, never sizes', () => {
    const style = readFileSync(
      join(
        directory,
        '../../../app/src/features/registration-preview/prototypeStyle.ts',
      ),
      'utf8',
    );
    expect(style).toContain("theme.density === 'kompakt' ? '10px' : '14px'");
    for (const use of declarations.filter((d) =>
      /--preview-space/.test(d.value),
    ))
      expect(use.property, use.selector).toMatch(
        /^(gap|row-gap|column-gap|margin|padding)(-[a-z]+)?$/,
      );
  });

  it('keeps focus visible with a ring colour that is never removed', () => {
    const removals = declarations.filter(
      (d) =>
        /focus/.test(d.selector) &&
        d.property === 'outline' &&
        /^(none|0)/.test(d.value),
    );
    expect(removals).toEqual([]);
  });
});
