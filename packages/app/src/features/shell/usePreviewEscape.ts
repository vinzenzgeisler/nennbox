import { useEffect } from 'react';
export function usePreviewEscape(
  onClosePreview: (() => void) | undefined,
  previewOpen: boolean,
) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        previewOpen &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open], [role=dialog], details[open]')
      ) {
        onClosePreview?.();
        document
          .querySelector<HTMLButtonElement>('[data-selected-entry]')
          ?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClosePreview, previewOpen]);
}
