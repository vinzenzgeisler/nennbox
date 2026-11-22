import { AppButton } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
export function EntryDetailNavigation({
  items,
  selected,
  page,
  pageSize,
  total,
  busy,
  openEntry,
}: {
  items: Entry[];
  selected: Entry;
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  openEntry: (id: string) => Promise<void>;
}) {
  const index = items.findIndex((item) => item.id === selected.id);
  return (
    <span>
      <span>
        {index >= 0
          ? `${(page - 1) * pageSize + index + 1} von ${total}`
          : `${total} Nennungen`}
      </span>
      <AppButton
        tone="ghost"
        aria-label="Vorherige Nennung"
        disabled={busy || index <= 0}
        onClick={() => {
          if (index > 0) void openEntry(items[index - 1]!.id);
        }}
      >
        ↑
      </AppButton>
      <AppButton
        tone="ghost"
        aria-label="Nächste Nennung"
        disabled={busy || index < 0 || index >= items.length - 1}
        onClick={() => {
          if (index >= 0 && index < items.length - 1)
            void openEntry(items[index + 1]!.id);
        }}
      >
        ↓
      </AppButton>
    </span>
  );
}
