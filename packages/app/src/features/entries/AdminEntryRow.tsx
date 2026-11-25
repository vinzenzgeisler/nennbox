import { EntryWarnings } from './warnings/EntryWarnings.js';
import type { EntryWarning } from './warnings/entryWarnings.js';
import { useEffect, useRef, useState } from 'react';
import { EntryQuickMenu } from './EntryQuickMenu.js';
import { type OnEntryQuickAction } from './entryQuickActions.js';
import { assignedNumber, numberWish } from './entryStartNumber.js';
import { EntryDataHints } from './EntryDataHints.js';
import type { Dispatch, SetStateAction } from 'react';
import { EntryResponse, type EntryResponse as Entry } from '@nennbox/contracts';
import { CompletionDots, EntryListRow, EntryStatusMenu } from '@nennbox/ui';
import { completionStates } from './completionStates.js';
import { request } from './AdminEntriesModel.js';
import type { WorkflowView } from './AdminEntriesModel.js';
type Selection = { eventId: string; ids: Set<string> };
export function AdminEntryRow({
  entry,
  warnings,
  eventId,
  selected,
  selectedIds,
  setSelection,
  classes,
  workflow,
  openEntry,
  openDetail,
  onChangeStatus,
  onQuickAction,
  canMessage,
}: {
  onQuickAction?: OnEntryQuickAction | undefined;
  canMessage?: boolean | undefined;
  entry: Entry;
  warnings?: EntryWarning[] | undefined;
  eventId: string;
  selected: Entry | null;
  selectedIds: Set<string>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  openEntry: (id: string) => Promise<void>;
  openDetail?: ((id: string) => Promise<void>) | undefined;
  onChangeStatus: (entry: Entry, status: string) => Promise<void>;
}) {
  const [capabilities, setCapabilities] = useState<{
    source: Entry;
    value: Entry;
  } | null>(null);
  const capabilityEntry =
    capabilities?.source === entry
      ? capabilities.value
      : selected?.id === entry.id
        ? selected
        : entry;
  const capabilityRequest = useRef<AbortController | null>(null);
  useEffect(() => () => capabilityRequest.current?.abort(), [entry]);
  const loadStatusCapabilities = async () => {
    capabilityRequest.current?.abort();
    const controller = new AbortController();
    capabilityRequest.current = controller;
    try {
      const response = await request(
        `/admin/entries/${encodeURIComponent(entry.id)}`,
        { signal: controller.signal },
      );
      if (!response.ok) return;
      const parsed = EntryResponse.safeParse(await response.json());
      if (
        parsed.success &&
        parsed.data.id === entry.id &&
        !controller.signal.aborted
      )
        setCapabilities({ source: entry, value: parsed.data });
    } catch {
      /* A failed capability read must not enable actions. */
    }
  };
  const statusRef = useRef<HTMLSpanElement>(null);
  const details = entry.adminDetails;
  const name = details?.driver.name ?? 'Name nicht verfügbar';
  const vehicle = details
    ? `${details.vehicle.make} ${details.vehicle.model}`
    : 'Fahrzeug nicht verfügbar';
  return (
    <EntryListRow
      name={name}
      vehicle={vehicle}
      imageUrl={details?.vehicle.imageUrl ?? null}
      imageAlt="Fahrzeugbild"
      hints={
        <>
          <EntryDataHints entry={entry} compact />
          <EntryWarnings warnings={warnings} compact />
        </>
      }
      className={
        details?.eventClass.name ??
        classes.find((item) => item.id === entry.classId)?.name ??
        '—'
      }
      number={assignedNumber(entry)}
      requestedNumber={numberWish(entry)}
      selected={selected?.id === entry.id}
      dimmed={['rejected', 'withdrawn'].includes(
        workflow?.statuses.find(
          (item) => (item.id ?? item.key) === entry.acceptanceStatus,
        )?.category ?? '',
      )}
      checked={selectedIds.has(entry.id)}
      selectLabel={`${name} auswählen`}
      onSelect={(checked) =>
        setSelection((current) => {
          const ids = new Set(current.eventId === eventId ? current.ids : []);
          if (checked) ids.add(entry.id);
          else ids.delete(entry.id);
          return { eventId, ids };
        })
      }
      onOpen={() => void openEntry(entry.id)}
      onOpenDetail={() => void openDetail?.(entry.id)}
      status={
        <span
          ref={statusRef}
          onClickCapture={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('summary')
            )
              void loadStatusCapabilities();
          }}
        >
          <EntryStatusMenu
            label={
              workflow?.statuses.find(
                (item) => (item.id ?? item.key) === entry.acceptanceStatus,
              )?.labels.de ?? entry.acceptanceStatus
            }
            tone={statusTone(
              workflow?.statuses.find(
                (item) => (item.id ?? item.key) === entry.acceptanceStatus,
              )?.category,
            )}
            options={(workflow?.transitions ?? [])
              .filter(
                (edge) =>
                  edge.from === entry.acceptanceStatus &&
                  capabilityEntry.availableActions?.includes(
                    `acceptance:${edge.to}`,
                  ),
              )
              .map((item) => {
                const target = workflow?.statuses.find(
                  (status) => (status.id ?? status.key) === item.to,
                );
                return {
                  key: item.to,
                  label: target?.labels.de ?? item.to,
                  tone: statusTone(target?.category),
                };
              })}
            onChange={(status) => void onChangeStatus(entry, status)}
          />
        </span>
      }
      completion={<CompletionDots states={completionStates(entry)} />}
      openActionId={entry.id}
      menu={
        <EntryQuickMenu
          entry={entry}
          name={name}
          onEntryLoaded={(value) => setCapabilities({ source: entry, value })}
          workflow={workflow}
          openDetail={openDetail}
          onQuickAction={onQuickAction}
          canMessage={canMessage}
          openStatus={() => {
            const status = statusRef.current?.querySelector('details');
            if (status) {
              status.open = true;
              status.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
            }
          }}
        />
      }
    />
  );
}

function statusTone(
  category: string | undefined,
): 'offen' | 'vor' | 'zu' | 'neg' | 'ab' {
  if (category === 'accepted') return 'zu';
  if (category === 'waitlisted') return 'vor';
  if (category === 'rejected') return 'neg';
  if (category === 'withdrawn') return 'ab';
  return 'offen';
}
