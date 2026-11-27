import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { placeReleasingCategories } from '@nennbox/core';
import { entryStatusCategory } from './entry-status-category.js';
import { entries } from './schema/entries.js';

const releasing = sql.join(
  placeReleasingCategories.map((category) => sql`${category}`),
  sql`, `,
);

/**
 * Entries that hold a place: not withdrawn, not rejected. This is the only
 * definition used by start numbers and group activity. Class capacity adds the
 * waitlist exception in `entryHoldsClassSeat`. The same rule runs in core
 * (`releasesPlace`) and in SQL (`entry_category_holds_place`, migration 0053).
 */
export function entryHoldsPlace(category: SQLWrapper = entryStatusCategory()) {
  return sql`${category} not in (${releasing})`;
}

/** Class seat: holds a place, and waiters only count while their offer is open. */
export function entryHoldsClassSeat(
  now: SQLWrapper | Date = sql`now()`,
  category: SQLWrapper = entryStatusCategory(),
  offerDeadline: SQLWrapper = entries.waitlistConfirmationDeadline,
): SQL {
  return sql`(${entryHoldsPlace(category)} and (${category} <> 'waitlisted' or ${offerDeadline} > ${now}))`;
}
