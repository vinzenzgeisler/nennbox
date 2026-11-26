import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrations = new URL('../migrations/', import.meta.url);
const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(new URL('meta/_journal.json', migrations), 'utf8'),
);
const sqlTags = readdirSync(migrations)
  .filter((file) => file.endsWith('.sql'))
  .map((file) => file.slice(0, -4));
const journalTags = journal.entries.map((entry) => entry.tag);

describe('migration journal', () => {
  it('registers every SQL migration in the journal', () => {
    expect(sqlTags.filter((tag) => !journalTags.includes(tag))).toEqual([]);
  });

  it('has an SQL file for every journal entry', () => {
    expect(journalTags.filter((tag) => !sqlTags.includes(tag))).toEqual([]);
  });
});
