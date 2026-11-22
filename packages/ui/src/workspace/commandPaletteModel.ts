import type { IconName } from '../icon/Icon.js';

/** One target of „Suchen und springen“: a place, a setting or an action. */
export type CommandItem = {
  id: string;
  label: string;
  /** Quiet context after the label, e.g. where a setting lives. */
  detail?: string;
  icon: IconName;
  group: string;
  /** Extra words that find the item without being shown. */
  keywords?: string[];
  /** Runs the command. Items with `children` open their list instead. */
  onSelect?: () => void;
  /** A nested list, e.g. the events to switch to. Searched from the top level, too. */
  children?: CommandItem[];
  /** Placeholder of the search field while the nested list is open. */
  childrenPlaceholder?: string;
};

export type CommandGroup = { label: string; items: CommandItem[] };

const normalize = (value: string) => value.toLocaleLowerCase('de').trim();

/**
 * Items whose label, detail or keywords contain the query. An empty query
 * lists the given level as is; a query also finds nested items so an event
 * can be reached by its name without opening „Veranstaltung wechseln“ first.
 */
export function filterCommands(
  items: CommandItem[],
  query: string,
): CommandItem[] {
  const needle = normalize(query);
  if (!needle) return items;
  const matches = (item: CommandItem) =>
    [item.label, item.detail ?? '', ...(item.keywords ?? [])].some((text) =>
      normalize(text).includes(needle),
    );
  return items.flatMap((item) => [
    ...(matches(item) ? [item] : []),
    ...(item.children ?? []).filter(matches),
  ]);
}

/** Groups in the order they first appear; the flat order stays the keyboard order. */
export function groupCommands(items: CommandItem[]): CommandGroup[] {
  const groups: CommandGroup[] = [];
  for (const item of items) {
    const group = groups.find((entry) => entry.label === item.group);
    if (group) group.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  return groups;
}

/** Keyboard order follows the visible grouping, not the input order. */
export const orderedCommands = (items: CommandItem[]): CommandItem[] =>
  groupCommands(items).flatMap((group) => group.items);

/** The first match of the query in the label, split for highlighting. */
export function highlightParts(
  label: string,
  query: string,
): { before: string; match: string; after: string } | null {
  const needle = normalize(query);
  if (!needle) return null;
  const at = label.toLocaleLowerCase('de').indexOf(needle);
  if (at < 0) return null;
  return {
    before: label.slice(0, at),
    match: label.slice(at, at + needle.length),
    after: label.slice(at + needle.length),
  };
}

/** Next active index for ↑/↓; stays on the first or last item. */
export function moveActive(
  index: number,
  key: 'ArrowUp' | 'ArrowDown',
  count: number,
): number {
  if (count === 0) return 0;
  return key === 'ArrowDown'
    ? Math.min(count - 1, index + 1)
    : Math.max(0, index - 1);
}
