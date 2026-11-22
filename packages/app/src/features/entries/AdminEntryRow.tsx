import type { Dispatch, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import {
  CompletionDots,
  EntryListRow,
  EntryStatusMenu,
  HintLabel,
  Menu,
  MenuItem,
} from '@nennbox/ui';
import { completionStates } from './completionStates.js';
import type { WorkflowView } from './AdminEntriesModel.js';
import { documentStatusView, uploadLines } from './documents/documentLines.js';
type Selection = { eventId: string; ids: Set<string> };
export function AdminEntryRow({
  entry,
  eventId,
  selected,
  selectedIds,
  setSelection,
  classes,
  workflow,
  openEntry,
  openDetail,
  onChangeStatus,
}: {
  entry: Entry;
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
          {entry.waitlistPosition != null && (
            <HintLabel>Warteliste · Platz {entry.waitlistPosition}</HintLabel>
          )}
          {entry.statusProjection?.hints
            .filter((hint) => hint.present)
            .map((hint) => (
              <HintLabel key={hint.key}>
                {hint.key === 'double_starter'
                  ? 'Doppelstarter'
                  : hint.key === 'passenger'
                    ? 'mit Beifahrer'
                    : 'Nachnennung'}
              </HintLabel>
            ))}
          {entry.documentProjection &&
            entry.documentProjection.requiredCount > 0 && (
              <span
                className="nb-entry-list-document-count"
                title={uploadLines(entry)
                  .map(
                    (line) =>
                      `${line.label}: ${documentStatusView(line.status).label}`,
                  )
                  .join(' · ')}
              >
                <HintLabel>
                  <span className="nb-entry-list-document-label">
                    Unterlagen{' '}
                  </span>
                  {`${entry.documentProjection.uploadedRequiredCount}/${entry.documentProjection.requiredCount}`}
                </HintLabel>
              </span>
            )}
        </>
      }
      className={
        details?.eventClass.name ??
        classes.find((item) => item.id === entry.classId)?.name ??
        '—'
      }
      number={entry.requestedStartNumber ?? details?.startNumber ?? null}
      selected={selected?.id === entry.id}
      dimmed={['rejected', 'withdrawn'].includes(
        workflow?.statuses.find((item) => item.key === entry.acceptanceStatus)
          ?.category ?? '',
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
        <EntryStatusMenu
          label={
            workflow?.statuses.find(
              (item) => item.key === entry.acceptanceStatus,
            )?.labels.de ?? entry.acceptanceStatus
          }
          tone={statusTone(
            workflow?.statuses.find(
              (item) => item.key === entry.acceptanceStatus,
            )?.category,
          )}
          options={(workflow?.transitions ?? [])
            .filter((item) => item.from === entry.acceptanceStatus)
            .map((item) => {
              const target = workflow?.statuses.find(
                (status) => status.key === item.to,
              );
              return {
                key: item.to,
                label: target?.labels.de ?? item.to,
                tone: statusTone(target?.category),
              };
            })}
          onChange={(status) => void onChangeStatus(entry, status)}
        />
      }
      completion={<CompletionDots states={completionStates(entry)} />}
      openActionId={entry.id}
      menu={
        <Menu label={`Weitere Aktionen für ${name}`}>
          {openDetail && (
            <MenuItem onClick={() => void openDetail(entry.id)}>
              Öffnen
            </MenuItem>
          )}
          <MenuItem onClick={() => void openEntry(entry.id)}>
            Vorschau öffnen
          </MenuItem>
        </Menu>
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
