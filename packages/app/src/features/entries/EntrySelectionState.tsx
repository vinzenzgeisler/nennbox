import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

type Selection = { eventId: string; ids: Set<string> };
type ByEvent = Record<string, Set<string>>;
const SelectionContext = createContext<{
  values: ByEvent;
  update: Dispatch<SetStateAction<ByEvent>>;
} | null>(null);

/** Selection belongs to this signed-in app instance, not a module or another event. */
export function EntrySelectionProvider({ children }: { children: ReactNode }) {
  const [values, update] = useState<ByEvent>({});
  const value = useMemo(() => ({ values, update }), [values]);
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useEntryBulkSelection(eventId: string) {
  const shared = useContext(SelectionContext);
  const [local, setLocal] = useState<Selection>(() => ({
    eventId,
    ids: new Set(),
  }));
  const update = shared?.update;
  const setSelection = useCallback<Dispatch<SetStateAction<Selection>>>(
    (action) => {
      if (!update) return setLocal(action);
      update((current) => {
        const previous = {
          eventId,
          ids: current[eventId] ?? new Set<string>(),
        };
        const next = typeof action === 'function' ? action(previous) : action;
        return { ...current, [next.eventId]: next.ids };
      });
    },
    [eventId, update],
  );
  return [
    shared
      ? { eventId, ids: shared.values[eventId] ?? new Set<string>() }
      : local,
    setSelection,
  ] as const;
}
