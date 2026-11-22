import { useEffect, useState } from 'react';
import {
  AdminEntryListResponse,
  type EntryResponse as Entry,
} from '@nennbox/contracts';
import type { CommandItem } from '@nennbox/ui';
import { adminFetch } from '../../auth.js';

/** Bounded event-scoped suggestions; free-text search still covers every entry. */
export function usePaletteEntries(
  open: boolean,
  eventId: string,
  select?: (entry: Entry) => void,
): CommandItem[] {
  const [result, setResult] = useState<{
    eventId: string;
    entries: Entry[];
  } | null>(null);
  useEffect(() => {
    if (!open || !eventId || !select) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      eventId,
      page: '1',
      pageSize: '100',
      sort: 'createdAt',
      direction: 'desc',
    });
    void adminFetch(`/admin/entries?${params}`, {
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) =>
        response.ok
          ? AdminEntryListResponse.parse(await response.json()).items
          : [],
      )
      .then((entries) => {
        if (!controller.signal.aborted)
          setResult({
            eventId,
            entries: entries.filter((entry) => entry.eventId === eventId),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ eventId, entries: [] });
      });
    return () => controller.abort();
  }, [open, eventId, select]);
  if (!open || result?.eventId !== eventId || !select) return [];
  return result.entries.map((entry) => ({
    id: `entry-${entry.id}`,
    label: entry.adminDetails?.driver.name ?? entry.orgaCode ?? 'Nennung',
    detail: [
      entry.requestedStartNumber ? `Nr. ${entry.requestedStartNumber}` : '',
      entry.adminDetails?.vehicle.make,
      entry.adminDetails?.vehicle.model,
    ]
      .filter(Boolean)
      .join(' · '),
    keywords: [entry.orgaCode ?? '', entry.adminDetails?.eventClass.name ?? ''],
    icon: 'list',
    group: 'Nennungen',
    onSelect: () => select(entry),
  }));
}
