import type { EntryResponse as Entry } from '@nennbox/contracts';

/** Legacy adminDetails.startNumber echoed the wish, so it cannot prove allocation. */
export function assignedNumber(entry: Entry): string | null {
  if (entry.startNumberStatus && entry.startNumberStatus !== 'assigned')
    return null;
  return entry.assignedStartNumber ?? null;
}

export function numberWish(entry: Entry): string | null {
  return entry.requestedStartNumber !== assignedNumber(entry)
    ? entry.requestedStartNumber
    : null;
}
