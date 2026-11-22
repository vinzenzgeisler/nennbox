import { useCallback, useEffect, useRef } from 'react';

/**
 * After a jump from the palette the focus belongs on the new page, not on the
 * control that opened it. Call the returned function when a command navigates;
 * the page heading takes the focus once the palette has closed.
 */
export function useHeadingFocusAfterPalette(
  paletteOpen: boolean,
  view: string,
) {
  const pending = useRef(false);
  useEffect(() => {
    if (paletteOpen || !pending.current) return;
    pending.current = false;
    document.querySelector<HTMLElement>('.nb-page-header h1')?.focus();
  }, [paletteOpen, view]);
  return useCallback(() => {
    pending.current = true;
  }, []);
}
