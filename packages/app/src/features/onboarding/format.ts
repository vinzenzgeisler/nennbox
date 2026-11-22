const long = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function formatDay(iso: string | null): string {
  return iso ? long.format(day(iso)) : '–';
}

/** "12.–13. Juni 2027" for a range inside one month, the full dates otherwise. */
export function formatRange(start: string | null, end: string | null): string {
  if (!start) return '–';
  if (!end || end === start) return formatDay(start);
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
  new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);
