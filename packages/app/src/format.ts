/**
 * The single source for dates, times and money shown in the admin app.
 * German locale everywhere; the public registration form formats by the
 * visitor's locale and stays out of here.
 */
const LOCALE = 'de-DE';
const MINOR_UNITS_PER_MAJOR = 100;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

const long = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const amountInput = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** "22. Mai 2027" for an ISO day (`YYYY-MM-DD`, a time part is ignored). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '–';
  return ISO_DAY.test(iso) ? long.format(day(iso)) : iso;
}

/** "12.–13. Juni 2027" for a range inside one month, the full dates otherwise. */
export function formatRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return '–';
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return formatDay(start);
  if (!ISO_DAY.test(start) || !ISO_DAY.test(end))
    return `${formatDay(start)} – ${formatDay(end)}`;
  const a = day(start);
  const b = day(end);
  if (
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCFullYear() === b.getUTCFullYear()
  )
    return `${a.getUTCDate()}.–${formatDay(end)}`;
  return `${formatDay(start)} – ${formatDay(end)}`;
}

export const formatTime = (ms: number) =>
  new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);

/** "120,00 €" for an amount in minor units. */
export const formatMoney = (cents: number, currency = 'EUR'): string =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(
    cents / MINOR_UNITS_PER_MAJOR,
  );

/** "120,00" for an editable amount field: no symbol, no thousands separator. */
export const formatAmountInput = (cents: number): string =>
  amountInput.format(cents / MINOR_UNITS_PER_MAJOR);

/**
 * Shows a typed fee ("120.00", "25", "7,5") as money. Input that is not a
 * valid amount is shown as typed, so a half-finished entry never disappears.
 */
export function formatFeeText(value: string, currency = 'EUR'): string {
  const text = value.trim();
  if (!text) return formatMoney(0, currency);
  const normalized = text.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return `${text} €`;
  return formatMoney(Math.round(Number(normalized) * 100), currency);
}
