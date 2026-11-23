import { useCallback, useRef, useState } from 'react';
import type {
  EntryQuickActionRequest,
  OnEntryQuickAction,
} from './entryQuickActions.js';

export function useEntryQuickRequest(
  openDetail: (id: string) => Promise<void>,
) {
  const token = useRef(0);
  const [request, setRequest] = useState<EntryQuickActionRequest | null>(null);
  const onQuickAction: OnEntryQuickAction = useCallback(
    (entryId, action) => {
      setRequest({ entryId, action, token: ++token.current });
      void openDetail(entryId);
    },
    [openDetail],
  );
  const clear = useCallback(() => setRequest(null), []);
  return { request, onQuickAction, clear };
}
