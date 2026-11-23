import { AppButton } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
export function EntryDetailNavigation({
  items,
  selected,
  page,
  pageSize,
  total,
  busy,
  navigate,
}: {
  items: Entry[];
  selected: Entry;
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  navigate: (direction: -1 | 1) => Promise<void>;
}) {
  const index = items.findIndex((item) => item.id === selected.id);
  const position = (page - 1) * pageSize + index;
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
        disabled={busy || index < 0 || position <= 0}
        onClick={() => {
          void navigate(-1);
        }}
      >
        ↑
      </AppButton>
      <AppButton
        tone="ghost"
        aria-label="Nächste Nennung"
        disabled={busy || index < 0 || position >= total - 1}
        onClick={() => {
          void navigate(1);
        }}
      >
        ↓
      </AppButton>
    </span>
  );
}
