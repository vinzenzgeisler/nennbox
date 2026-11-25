import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';

export function useAdminEntriesKeyboard({
  items,
  selected,
  isDetailOpen,
  openEntry,
  openDetail,
  closeDetail,
  closePreview,
  setSelected,
}: {
  items: Entry[];
  selected: Entry | null;
  isDetailOpen: boolean;
  openEntry: (id: string) => Promise<void>;
  openDetail: () => void;
  closeDetail: () => void;
  closePreview?: (() => void) | undefined;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
}) {
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        document.querySelector('dialog[open], [role=dialog], details[open]') ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)))
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      if (isDetailOpen) {
        const direction = ['ArrowDown', 'j'].includes(event.key)
          ? 1
          : ['ArrowUp', 'k'].includes(event.key)
            ? -1
            : 0;
        if (direction) {
          const index = items.findIndex((item) => item.id === selected?.id);
          const next = index + direction;
          if (index >= 0 && next >= 0 && next < items.length) {
            event.preventDefault();
            void openEntry(items[next]!.id);
          }
        }
        // Open menus and dialogs keep their own keys; Escape otherwise leaves the detail.
        if (event.key === 'Escape' && !document.querySelector('dialog[open]'))
          closeDetail();
        return;
      }
      const index = items.findIndex((item) => item.id === selected?.id);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!items.length) return;
        event.preventDefault();
        const next = Math.min(
          items.length - 1,
          Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)),
        );
        document
          .querySelector<HTMLButtonElement>(
            `[data-entry-action="${items[next]!.id}"]`,
          )
          ?.click();
      } else if (event.key === 'Escape' && selected) {
        if (closePreview) {
          event.preventDefault();
          closePreview();
          document
            .querySelector<HTMLButtonElement>('[data-selected-entry]')
            ?.focus();
        } else setSelected(null);
      } else if (
        event.key === 'Enter' &&
        selected &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest(
            'a, button:not([data-entry-action]), [role=tab], summary, [role=menuitem], input, select, textarea',
          )
        )
      ) {
        event.preventDefault();
        openDetail();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [
    items,
    selected,
    isDetailOpen,
    openEntry,
    openDetail,
    closeDetail,
    closePreview,
    setSelected,
  ]);
}
