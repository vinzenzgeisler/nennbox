import { useEffect, useRef, useState } from 'react';
import { EntryResponse, type EntryResponse as Entry } from '@nennbox/contracts';
import { Icon, Menu, MenuItem } from '@nennbox/ui';
import { request, type WorkflowView } from './AdminEntriesModel.js';
import {
  canRequestQuickAction,
  quickCancellation,
  quickStatusTransitions,
  type OnEntryQuickAction,
} from './entryQuickActions.js';

export function EntryQuickMenu({
  entry,
  name,
  workflow,
  openDetail,
  openStatus,
  onQuickAction,
  onEntryLoaded,
  canMessage = false,
}: {
  onEntryLoaded: (entry: Entry) => void;
  entry: Entry;
  name: string;
  workflow: WorkflowView | null;
  openDetail?: ((id: string) => Promise<void>) | undefined;
  openStatus: () => void;
  onQuickAction?: OnEntryQuickAction | undefined;
  canMessage?: boolean | undefined;
}) {
  const [fresh, setFresh] = useState<{ source: Entry; value: Entry } | null>(
    null,
  );
  const [error, setError] = useState('');
  const scope = useRef<AbortController | null>(null);
  useEffect(() => () => scope.current?.abort(), []);
  const current = fresh?.source === entry ? fresh.value : entry;
  const cancel = quickCancellation(current, workflow);
  const load = async (open: boolean) => {
    scope.current?.abort();
    if (!open) return;
    setError('');
    const controller = new AbortController();
    scope.current = controller;
    try {
      const response = await request(
        `/admin/entries/${encodeURIComponent(entry.id)}`,
        {
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error();
      const parsed = EntryResponse.safeParse(await response.json());
      if (!parsed.success || parsed.data.id !== entry.id) throw new Error();
      if (!controller.signal.aborted) {
        setFresh({ source: entry, value: parsed.data });
        onEntryLoaded(parsed.data);
      }
    } catch {
      if (!controller.signal.aborted) {
        setFresh(null);
        setError('Aktionen konnten nicht geladen werden.');
      }
    }
  };
  return (
    <Menu
      label={`Weitere Aktionen für ${name}`}
      onOpenChange={(open) => void load(open)}
    >
      {openDetail && (
        <MenuItem shortcut="Enter" onClick={() => void openDetail(entry.id)}>
          <Icon name="next" />
          Öffnen
        </MenuItem>
      )}
      {quickStatusTransitions(current, workflow).length > 0 && (
        <MenuItem shortcut="S" onClick={openStatus}>
          <Icon name="approval" />
          Status ändern
        </MenuItem>
      )}
      {onQuickAction &&
        canRequestQuickAction(
          current,
          { kind: 'message' },
          workflow,
          canMessage,
        ) && (
          <>
            <MenuItem
              shortcut="M"
              onClick={() => onQuickAction(entry.id, { kind: 'message' })}
            >
              <Icon name="mail" />
              Nachricht senden
            </MenuItem>
            <MenuItem
              onClick={() => onQuickAction(entry.id, { kind: 'documents' })}
            >
              <Icon name="document" />
              Unterlagen anfordern
            </MenuItem>
          </>
        )}
      {onQuickAction && current.availableActions?.includes('start_number') && (
        <MenuItem
          onClick={() => onQuickAction(entry.id, { kind: 'start_number' })}
        >
          <Icon name="list" />
          Startnummer ändern
        </MenuItem>
      )}
      {onQuickAction &&
        (cancel || current.availableActions?.includes('delete')) && (
          <div role="separator" />
        )}
      {onQuickAction && cancel && (
        <MenuItem
          tone="danger"
          onClick={() =>
            onQuickAction(entry.id, { kind: 'cancel', to: cancel.to })
          }
        >
          Nennung absagen …
        </MenuItem>
      )}
      {onQuickAction && current.availableActions?.includes('delete') && (
        <MenuItem
          tone="danger"
          onClick={() => onQuickAction(entry.id, { kind: 'delete' })}
        >
          Nennung löschen …
        </MenuItem>
      )}
      {error && <p role="status">{error}</p>}
    </Menu>
  );
}
