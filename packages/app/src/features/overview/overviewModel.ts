import type { EntryFilterKey, EventOverview } from '@nennbox/contracts';

const MINOR_UNITS_PER_MAJOR = 100;

export type EntryFilters = Partial<
  Record<EntryFilterKey | 'missingDocuments', string>
>;
export type OverviewStatus = {
  key: string;
  labels: { de: string; en: string };
  category: string;
  color: string;
};

export const formatMoney = (cents: number, currency: string): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
    cents / MINOR_UNITS_PER_MAJOR,
  );

export type StatusRow = { key: string; label: string; count: number };

/** Use exactly the active workflow's labels and order, never category aliases. */
export function statusRows(
  statuses: EventOverview['statuses'],
  workflowStatuses: OverviewStatus[],
): StatusRow[] {
  const known = new Set(workflowStatuses.map((status) => status.key));
  return [
    ...workflowStatuses.map((status) => ({
      key: status.key,
      label: status.labels.de,
      count: statuses[status.key] ?? 0,
    })),
    ...Object.entries(statuses)
      .filter(([key]) => !known.has(key))
      .map(([key, count]) => ({
        key,
        label: key.trim() || 'Unbekannter Status',
        count,
      })),
  ];
}

export const totalEntries = (statuses: EventOverview['statuses']): number =>
  Object.values(statuses).reduce((sum, count) => sum + count, 0);

export function deadlineText(days: number | null): {
  value: string;
  detail: string;
} {
  if (days === null)
    return { value: '–', detail: 'Kein Nennungsschluss festgelegt' };
  if (days === 0) return { value: '0', detail: 'Heute oder bereits vorbei' };
  return { value: String(days), detail: days === 1 ? 'Tag' : 'Tage' };
}

/** Wording of a warning from the overview; the server owns the filter, not the sentence. */
export function warningText(
  warning: EventOverview['warnings'][number],
): string {
  const noun = warning.count === 1 ? 'Nennung' : 'Nennungen';
  return `${warning.count} ${noun} ohne bestätigte E-Mail-Adresse`;
}

/**
 * The entry-list filters to open for a warning: exactly the ones the server delivered, and
 * only for the event that is shown, so a late answer cannot filter another event's list.
 */
export function warningFilters(
  warning: EventOverview['warnings'][number],
  eventId: string,
): EntryFilters | null {
  if (warning.filter.eventId !== eventId) return null;
  return { verificationStatus: warning.filter.verificationStatus };
}
