import { useEffect, type RefObject } from 'react';

/** A swipeable tab row keeps the selected tab in view, e.g. after keyboard arrows or a deep link. */
export function useRevealActiveTab(
  row: RefObject<HTMLElement | null>,
  activeKey: string | undefined,
) {
  useEffect(() => {
    const active = row.current?.querySelector<HTMLElement>(
      '[aria-selected="true"], [aria-pressed="true"]',
    );
    // jsdom and very old browsers have no scrollIntoView.
    active?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [row, activeKey]);
}
