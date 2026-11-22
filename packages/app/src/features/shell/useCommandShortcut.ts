import { useEffect, useRef } from 'react';

/**
 * ⌘K (macOS) or Ctrl+K toggles „Suchen und springen“. A native modal dialog
 * keeps the rest of the page inert, so the shortcut waits until it closes.
 */
export function useCommandShortcut(toggle: () => void) {
  const latest = useRef(toggle);
  useEffect(() => {
    latest.current = toggle;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'k' ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
