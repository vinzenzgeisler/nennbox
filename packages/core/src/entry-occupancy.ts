import type { EntryWorkflowCategory } from './workflow-model.js';

/**
 * Single rule for "does this entry hold a place": withdrawn and rejected
 * entries hold neither a class seat nor a start number. Everything else does,
 * except waitlisted entries, which only hold a seat while an offer is running
 * (see `holdsClassSeat`). SQL mirror: `entry_category_holds_place()` (0053).
 */
export const placeReleasingCategories = ['withdrawn', 'rejected'] as const;

export function releasesPlace(category: string): boolean {
  return (placeReleasingCategories as readonly string[]).includes(category);
}

/** Class capacity: waiters count only while their confirmation offer is open. */
export function holdsClassSeat(
  category: EntryWorkflowCategory | string,
  offerOpen: boolean,
): boolean {
  if (releasesPlace(category)) return false;
  return category === 'waitlisted' ? offerOpen : true;
}
