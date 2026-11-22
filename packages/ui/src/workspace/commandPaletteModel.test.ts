import { describe, expect, it } from 'vitest';
import {
  filterCommands,
  groupCommands,
  highlightParts,
  moveActive,
  orderedCommands,
  type CommandItem,
} from './commandPaletteModel.js';

const item = (
  id: string,
  label: string,
  group: string,
  extra: Partial<CommandItem> = {},
): CommandItem => ({ id, label, group, icon: 'list', ...extra });

const items: CommandItem[] = [
  item('workflow', 'Nennungsablauf bearbeiten', 'Einstellungen', {
    detail: 'Status und Übergänge',
  }),
  item('entries', 'Nennungen', 'Springen zu'),
  item('form', 'Nennformular bearbeiten', 'Einstellungen', {
    keywords: ['Formularfelder'],
  }),
  item('switch', 'Veranstaltung wechseln', 'Springen zu', {
    children: [
      item('event-b', 'Bergpreis 2027', 'Veranstaltung wechseln'),
      item('event-c', 'Straßenrennen 2027', 'Veranstaltung wechseln'),
    ],
  }),
];

describe('filterCommands', () => {
  it('lists the level unchanged without a query', () => {
    expect(filterCommands(items, '  ')).toBe(items);
  });
  it('matches label, detail and keywords case-insensitively', () => {
    expect(filterCommands(items, 'NENN').map((entry) => entry.id)).toEqual([
      'workflow',
      'entries',
      'form',
    ]);
    expect(filterCommands(items, 'übergänge').map((entry) => entry.id)).toEqual(
      ['workflow'],
    );
    expect(filterCommands(items, 'felder').map((entry) => entry.id)).toEqual([
      'form',
    ]);
  });
  it('finds nested items by name from the top level', () => {
    expect(filterCommands(items, 'straßen').map((entry) => entry.id)).toEqual([
      'event-c',
    ]);
    expect(filterCommands(items, 'veranstaltung').map((e) => e.id)).toEqual([
      'switch',
    ]);
  });
  it('returns nothing for an unknown text', () => {
    expect(filterCommands(items, 'xyz')).toEqual([]);
  });
});

describe('grouping', () => {
  it('keeps the groups in order of first appearance', () => {
    expect(groupCommands(items).map((group) => group.label)).toEqual([
      'Einstellungen',
      'Springen zu',
    ]);
  });
  it('orders the keyboard sequence like the visible groups', () => {
    expect(orderedCommands(items).map((entry) => entry.id)).toEqual([
      'workflow',
      'form',
      'entries',
      'switch',
    ]);
  });
});

describe('highlightParts', () => {
  it('splits the first match out of the label', () => {
    expect(highlightParts('E-Mail-Vorlage „Nennung“', 'nenn')).toEqual({
      before: 'E-Mail-Vorlage „',
      match: 'Nenn',
      after: 'ung“',
    });
  });
  it('marks nothing for an empty query or a match outside the label', () => {
    expect(highlightParts('Nennungen', '')).toBeNull();
    expect(highlightParts('Nennungsablauf', 'Status')).toBeNull();
  });
});

describe('moveActive', () => {
  it('moves within the results and stops at both ends', () => {
    expect(moveActive(0, 'ArrowDown', 3)).toBe(1);
    expect(moveActive(2, 'ArrowDown', 3)).toBe(2);
    expect(moveActive(1, 'ArrowUp', 3)).toBe(0);
    expect(moveActive(0, 'ArrowUp', 3)).toBe(0);
    expect(moveActive(0, 'ArrowDown', 0)).toBe(0);
  });
});
