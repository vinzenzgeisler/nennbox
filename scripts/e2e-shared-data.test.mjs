import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The browser specs share one seeded stack and run in parallel workers. A spec that confirms a
// deletion on a row it picked by position removes data another worker is just reading (main went
// red when entry-detail-ux deleted the newest entry while entry-list-design had it open).
const e2eDirectory = new URL('../packages/app/e2e/', import.meta.url);
const specs = readdirSync(e2eDirectory).filter((file) =>
  file.endsWith('.spec.ts'),
);
const isDestructive = (file) => file.endsWith('.destructive.spec.ts');
const read = (file) => readFileSync(new URL(file, e2eDirectory), 'utf8');
const confirmsDeletion = (source) =>
  /getByRole\('button',\s*\{\s*name:\s*'Nennung löschen',\s*exact:\s*true\s*\}\)\s*\.click\(\)/.test(
    source,
  );
const picksRowByPosition = (source) =>
  /nb-entry-list-row'\)\s*\.(?:first|nth)\(/.test(source);

describe('browser specs and shared demo data', () => {
  it('finds the specs', () => {
    expect(specs).toContain('entry-list-design.spec.ts');
  });

  it.each(specs.filter((file) => !isDestructive(file)))(
    '%s does not delete rows it picked by position',
    (file) => {
      const source = read(file);
      expect(confirmsDeletion(source) && picksRowByPosition(source)).toBe(
        false,
      );
    },
  );

  it('runs destructive specs in a project that waits for all others', () => {
    const config = readFileSync(
      new URL('../packages/app/playwright.config.ts', import.meta.url),
      'utf8',
    );
    expect(config).toMatch(/testIgnore:\s*destructive/);
    expect(config).toMatch(/testMatch:\s*destructive/);
    expect(config).toMatch(/dependencies:\s*\['shared-data'\]/);
    for (const file of specs.filter(isDestructive))
      expect(confirmsDeletion(read(file))).toBe(true);
  });
});
