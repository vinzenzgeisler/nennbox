import { useLayoutEffect, useRef } from 'react';

const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Keep the narrow-screen sheet modal until it closes or becomes a desktop column. */
export function useEmergingSheet(
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
    const sheet = ref.current;
    if (!open || !sheet) return;
    const shell = sheet.closest('.nb-onb');
    const opener = shell?.querySelector<HTMLElement>('.nb-onb-emerging-bar');
    const background: Array<{ node: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement = sheet;
    while (branch !== shell && branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          background.push({
            node: sibling,
            inert: sibling.hasAttribute('inert'),
          });
          sibling.setAttribute('inert', '');
        }
      }
      branch = branch.parentElement;
    }
    const controls = () =>
      [...sheet.querySelectorAll<HTMLElement>(focusable)].filter(
        (node) => !node.closest('[hidden], [inert]'),
      );
    const focusFirst = () => (controls()[0] ?? sheet).focus();
    focusFirst();
    const onFocus = (event: FocusEvent) => {
      if (!sheet.contains(event.target as Node)) focusFirst();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      } else if (event.key === 'Tab') {
        const items = controls();
        const first = items[0] ?? sheet;
        const last = items.at(-1) ?? sheet;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    // The bar is CSS-hidden on desktop; release modality when the column returns.
    const desktop = window.matchMedia?.('(min-width: 1241px)');
    const onResize = () => {
      if (desktop?.matches) setOpen(false);
    };
    desktop?.addEventListener('change', onResize);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('keydown', onKey, true);
    return () => {
      desktop?.removeEventListener('change', onResize);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('keydown', onKey, true);
      for (const { node, inert } of background) {
        if (!inert) node.removeAttribute('inert');
      }
      if (opener?.isConnected && !desktop?.matches) {
        returnFocus.current = opener;
        opener.focus();
      }
    };
  }, [open, setOpen]);
  return ref;
}
