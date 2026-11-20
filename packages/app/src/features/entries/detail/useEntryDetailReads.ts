import { useEffect, useState } from 'react';
import { EntryMessagesResponse } from '@nennbox/contracts';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { request } from '../AdminEntriesModel.js';

export type EntryMessage = EntryMessagesResponse['items'][number];

/** Mails for one entry; reloads whenever the entry changes (new mails follow status changes). */
export function useEntryMessages(entry: Entry) {
  const [state, setState] = useState<{
    key: string;
    items: EntryMessage[] | null;
    failed: boolean;
  }>({ key: '', items: null, failed: false });
  const key = `${entry.id}|${entry.adminHistory?.length ?? 0}`;
  useEffect(() => {
    const controller = new AbortController();
    void request(`/admin/entries/${encodeURIComponent(entry.id)}/messages`, {
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? EntryMessagesResponse.parse(await response.json()).items
          : Promise.reject(new Error('rejected')),
      )
      .then((items) => setState({ key, items, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, items: null, failed: true });
      });
    return () => controller.abort();
  }, [entry.id, key]);
  return state.key === key ? state : { key, items: null, failed: false };
}

/** German labels for status values of the event, so history never shows raw keys. */
export function useDimensionLabels(eventId: string) {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const controller = new AbortController();
    void request(
      `/admin/events/${encodeURIComponent(eventId)}/status-dimensions`,
      {
        signal: controller.signal,
      },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((config: unknown) => {
        const dimensions =
          (
            config as {
              dimensions?: Array<{
                values: Array<{ key: string; labels: { de: string } }>;
              }>;
            } | null
          )?.dimensions ?? [];
        setLabels(
          new Map(
            dimensions.flatMap((item) =>
              item.values.map((value) => [value.key, value.labels.de] as const),
            ),
          ),
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId]);
  return labels;
}
