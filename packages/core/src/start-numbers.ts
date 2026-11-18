export type StartNumberMode =
  'driver_choice' | 'organizer_assigned' | 'automatic';

export interface StartNumberRange {
  readonly from: number;
  readonly to: number;
  readonly reserved: readonly number[];
  readonly classId: string | null;
}

export function availableStartNumbers(
  range: StartNumberRange,
  assigned: readonly string[],
): string[] {
  if (
    !Number.isSafeInteger(range.from) ||
    !Number.isSafeInteger(range.to) ||
    range.from < 0 ||
    range.to < range.from
  )
    throw new Error('Invalid start number range');
  const unavailable = new Set([
    ...range.reserved.map(String),
    ...assigned.map((value) => value.trim().toUpperCase()),
  ]);
  const result: string[] = [];
  for (let value = range.from; value <= range.to; value++) {
    if (!unavailable.has(String(value))) result.push(String(value));
  }
  return result;
}

export function allocateNextStartNumbers<T extends { readonly id: string }>(
  entries: readonly T[],
  available: readonly string[],
): Array<{ readonly entryId: string; readonly startNumber: string }> {
  return entries.flatMap((entry, index) => {
    const startNumber = available[index];
    return startNumber === undefined
      ? []
      : [{ entryId: entry.id, startNumber }];
  });
}

export function nextWaitlistPosition(
  positions: readonly (number | null)[],
): number {
  return (
    Math.max(
      0,
      ...positions.filter((value): value is number => Number.isInteger(value)),
    ) + 1
  );
}

export function confirmationDeadline(now: Date, hours = 48): Date {
  if (!Number.isInteger(hours) || hours < 1 || hours > 720)
    throw new Error('Invalid confirmation period');
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function dueWaitlistOffers<
  T extends { readonly id: string; readonly deadline: Date | null },
>(offers: readonly T[], now: Date): T[] {
  return offers.filter(
    (offer) =>
      offer.deadline !== null && offer.deadline.getTime() <= now.getTime(),
  );
}
