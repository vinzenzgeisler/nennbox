export function relativeEntryTime(iso: string, now = Date.now()) {
  const date = new Date(iso);
  const minutes = Math.floor((now - date.getTime()) / 60000);
  if (minutes >= 0 && minutes < 1) return 'gerade eben';
  if (minutes >= 1 && minutes < 60) return `vor ${minutes} Min.`;
  if (minutes >= 60 && minutes < 1440)
    return `vor ${Math.floor(minutes / 60)} Std.`;
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Berlin',
  }).format(date);
}
