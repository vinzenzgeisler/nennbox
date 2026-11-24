import { useEffect, useState } from 'react';
import { request } from '../AdminEntriesModel.js';
import {
  warningsResponseSchema,
  workbasketWarningsSchema,
  type EntryWarning,
} from './entryWarnings.js';

type State = {
  path: string;
  revision: unknown;
  refresh: number;
  status: 'ready' | 'error';
  warnings: EntryWarning[];
};
export function useEntryWarnings(
  eventId: string,
  entryId?: string,
  revision?: unknown,
) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const path = !eventId
    ? ''
    : entryId
      ? `/admin/events/${encodeURIComponent(eventId)}/entries/${encodeURIComponent(entryId)}/warnings`
      : `/admin/events/${encodeURIComponent(eventId)}/workbasket`;
  useEffect(() => {
    const changed = () => setRefresh((value) => value + 1);
    window.addEventListener('nennbox:entries-changed', changed);
    return () => window.removeEventListener('nennbox:entries-changed', changed);
  }, []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await request(path, { signal: controller.signal });
        if (!response.ok) throw new Error('Warnings unavailable');
        const data: unknown = await response.json();
        const warnings = entryId
          ? warningsResponseSchema.parse(data).warnings
          : workbasketWarningsSchema.parse(data).tasks;
        if (!controller.signal.aborted)
          setState({
            path,
            revision,
            refresh,
            status: 'ready',
            warnings: warnings.filter(
              (item) =>
                item.severity === 'warning' &&
                item.entryId !== null &&
                (!entryId || item.entryId === entryId),
            ),
          });
      } catch {
        if (!controller.signal.aborted)
          setState({ path, revision, refresh, status: 'error', warnings: [] });
      }
    })();
    return () => controller.abort();
  }, [path, entryId, revision, refresh]);
  const current =
    state?.path === path &&
    state.revision === revision &&
    state.refresh === refresh
      ? state
      : null;
  return {
    warnings: current?.warnings ?? [],
    status: !path
      ? ('idle' as const)
      : (current?.status ?? ('loading' as const)),
    retry: () => setRefresh((value) => value + 1),
  };
}
