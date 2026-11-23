import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  AdminEntryListResponse,
  type EntryResponse as Entry,
} from '@nennbox/contracts';
import { request, type EntryQuery } from './AdminEntriesModel.js';

/** Resolve the neighbouring entry against the same filtered, sorted list. */
export function useEntryDetailNavigation({
  eventId,
  applied,
  items,
  selected,
  page,
  pageSize,
  total,
  openEntry,
  setPage,
  setActionError,
}: {
  eventId: string;
  applied: EntryQuery;
  items: Entry[];
  selected: Entry | null;
  page: number;
  pageSize: number;
  total: number;
  openEntry: (id: string) => Promise<void>;
  setPage: Dispatch<SetStateAction<number>>;
  setActionError: Dispatch<SetStateAction<string>>;
}) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const scope = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    return () => controller.abort();
  }, [eventId, applied]);

  const navigate = useCallback(
    async (direction: -1 | 1) => {
      if (pending.current || !selected) return;
      const index = items.findIndex((item) => item.id === selected.id);
      const position = (page - 1) * pageSize + index;
      if (
        index < 0 ||
        position + direction < 0 ||
        position + direction >= total
      )
        return;
      const controller = scope.current;
      if (!controller || controller.signal.aborted) return;
      pending.current = true;
      setBusy(true);
      setActionError('');
      try {
        const neighbour = items[index + direction];
        if (neighbour) {
          await openEntry(neighbour.id);
          return;
        }
        const targetPage = page + direction;
        const params = new URLSearchParams({
          eventId,
          page: String(targetPage),
          pageSize: String(pageSize),
          sort: applied.sort,
          direction: applied.direction,
        });
        for (const key of [
          'classId',
          'acceptanceStatus',
          'verificationStatus',
          'paymentStatus',
          'search',
        ] as const) {
          const value = applied[key].trim();
          if (value) params.set(key, value);
        }
        const response = await request(`/admin/entries?${params}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error('page unavailable');
        const result = AdminEntryListResponse.parse(await response.json());
        if (controller.signal.aborted) return;
        const target = direction === 1 ? result.items[0] : result.items.at(-1);
        if (!target) throw new Error('empty page');
        await openEntry(target.id);
        if (!controller.signal.aborted) setPage(targetPage);
      } catch {
        if (!controller.signal.aborted)
          setActionError(
            'Die benachbarte Nennung konnte nicht geladen werden. Bitte versuche es erneut.',
          );
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [
      applied,
      eventId,
      items,
      openEntry,
      page,
      pageSize,
      selected,
      setActionError,
      setPage,
      total,
    ],
  );
  return { navigate, busy };
}
