import { AccountSettings } from '../team/AccountSettings.js';
import { SessionPermissions } from './SessionPermissions.js';
import {
  pushEntryEvent,
  usePreviewPreference,
  useEntryEventHistory,
  readEntryEvent,
  parseShellEvents,
  type ShellEvent,
} from './entryWorkspacePreferences.js';
import { usePreviewStatusChange } from './usePreviewStatusChange.js';
import { EntryStatusToast } from '../entries/EntryStatusToast.js';
import { useWorkspacePreview } from '@nennbox/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { fetchAdminEntry } from './fetchAdminEntry.js';
import type { WorkflowView } from '../entries/AdminEntriesModel.js';
import { AdminEntries } from '../entries/AdminEntries.js';
import { AdminModules } from '../modules/AdminModules.js';
import { AppShell } from './AppShell.js';
import { AdminOverview } from '../overview/AdminOverview.js';
import { AdminExports } from '../exports/AdminExports.js';
import type { EntryFilters } from '../overview/overviewModel.js';
import { AdminMessages } from '../messages/AdminMessages.js';
import type { MessageSeed } from '../messages/messageSeed.js';
import { EntryPreview } from './EntryPreview.js';
import { RegistrationFormSettings } from '../registration/RegistrationFormSettings.js';
import { EventDocumentSettings } from '../event-documents/EventDocumentSettings.js';
import { AdminWorkflow } from '../workflow/AdminWorkflow.js';
import { EventSetup } from '../event-setup/EventSetup.js';
import { adminFetch } from '../../auth.js';
import { useAdminIdentity } from './useAdminIdentity.js';

export function AdminApplication() {
  const previewViewport = useWorkspacePreview();
  const identity = useAdminIdentity();
  const [events, setEvents] = useState<ShellEvent[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [entriesTarget, setEntriesTarget] = useState<{
    revision: number;
    filters: EntryFilters;
  }>({ revision: 0, filters: {} });
  const [selectedEvent, setSelectedEvent] = useState(readEntryEvent);

  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [messageSeed, setMessageSeed] = useState<MessageSeed | null>(null);
  const [previewWorkflow, setPreviewWorkflow] = useState<WorkflowView | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = usePreviewPreference();
  const [detailOpen, setDetailOpen] = useState(false);
  const closePreview = () => setPreviewOpen(false);
  const activeEvent = useRef('');
  /** One place for leaving an event: nothing of the old one may stay selected, open or busy. */
  const changeEvent = useCallback((id: string) => {
    pushEntryEvent(id);
    activeEvent.current = id;
    setSelectedEvent(id);
    setEntriesTarget((current) => ({ ...current, filters: {} }));
    setSelectedEntry(null);
    setMessageSeed(null);
    setDetailOpen(false);
    setPreviewBusy(false);
  }, []);
  useEntryEventHistory(events, activeEvent, changeEvent);
  const selectPaletteEntry = useCallback(
    (entry: Entry) => {
      if (entry.eventId !== activeEvent.current) return;
      setSelectedEntry(entry);
      setDetailOpen(!previewViewport);
      setPreviewOpen(previewViewport);
      setEntriesTarget((current) => ({
        revision: current.revision + 1,
        filters: {
          search: entry.adminDetails?.driver.name ?? entry.orgaCode ?? '',
        },
      }));
    },
    [previewViewport, setPreviewOpen],
  );
  const handleSelectionChange = useCallback(
    (entry: Entry | null) => {
      setSelectedEntry(entry);
      if (entry) setPreviewOpen(true);
      else {
        setDetailOpen(false);
        setPreviewOpen(false);
      }
    },
    [setPreviewOpen],
  );
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/events', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (!active || !Array.isArray(rows)) return;
        const parsed = parseShellEvents(rows);
        setEvents(parsed);
        const first = parsed[0]?.id ?? '';
        setSelectedEvent((current) => {
          const next = parsed.some((event) => event.id === current)
            ? current
            : first;
          activeEvent.current = next;
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const [entriesRevision, setEntriesRevision] = useState(0);
  const [previewAdvance, setPreviewAdvance] = useState<{
    eventId: string;
    entryId: string;
  } | null>(null);
  const previewAccepted = useCallback(
    ({ eventId, entryId }: { eventId: string; entryId: string }) => {
      // The list owns advancing to the next eligible entry.
      setPreviewAdvance({ eventId, entryId });
    },
    [],
  );
  const entriesChanged = useCallback(
    () => setEntriesRevision((value) => value + 1),
    [],
  );
  const openMessages = useCallback(
    (seed: MessageSeed) => {
      setMessageSeed(seed);
      setDetailOpen(false);
      setPreviewOpen(false);
    },
    [setPreviewOpen],
  );
  const previewStatus = usePreviewStatusChange({
    selectedEntry,
    activeEvent,
    setPreviewBusy,
    setSelectedEntry,
    previewAccepted,
    entriesChanged,
  });
  const entryPreview = selectedEntry ? (
    <EntryPreview
      entry={selectedEntry}
      workflow={previewWorkflow}
      busy={previewBusy}
      onClose={closePreview}
      onMessage={() =>
        openMessages({
          entryId: selectedEntry.id,
          subject: 'Bitte reiche deine Unterlagen nach',
          body: 'Hallo {{firstName}},\n\nbitte reiche die noch fehlenden Unterlagen für deine Nennung nach, damit wir sie vollständig bearbeiten können.',
        })
      }
      onOpenDetail={() => {
        setDetailOpen(true);
        setPreviewOpen(false);
      }}
      onNextAction={previewStatus.changeStatus}
      feedback={
        previewStatus.notice && (
          <EntryStatusToast
            notice={previewStatus.notice}
            clear={previewStatus.clearNotice}
          />
        )
      }
    />
  ) : undefined;
  return (
    <SessionPermissions.Provider value={identity?.permissions ?? []}>
      <AppShell
        permissions={identity?.permissions ?? []}
        canManageModules={identity?.canManageModules ?? false}
        events={events}
        messageEntryId={messageSeed?.entryId ?? null}
        onClearMessageSelection={() => setMessageSeed(null)}
        activeEvent={selectedEvent}
        entryCount={entryCount}
        entriesNavigationRevision={entriesTarget.revision}
        onEventChange={changeEvent}
        onEntrySelect={selectPaletteEntry}
        onEntrySearch={(search) => {
          setSelectedEntry(null);
          setDetailOpen(false);
          setEntriesTarget((current) => ({
            revision: current.revision + 1,
            filters: { search },
          }));
        }}
        previewOpen={previewOpen && !detailOpen}
        detailOpen={detailOpen}
        identity={identity}
        onClosePreview={closePreview}
      >
        {(view) =>
          view === 'overview' ? (
            <AdminOverview
              eventId={selectedEvent}
              onTotalChange={setEntryCount}
              onOpenEntry={async (id) => {
                const requestedEvent = activeEvent.current;
                const entry = await fetchAdminEntry(id);
                if (
                  activeEvent.current !== requestedEvent ||
                  entry.eventId !== requestedEvent
                )
                  return;
                selectPaletteEntry(entry);
                setDetailOpen(true);
              }}
              onOpenEntries={(filters) => {
                setSelectedEntry(null);
                setDetailOpen(false);
                setEntriesTarget((current) => ({
                  revision: current.revision + 1,
                  filters,
                }));
              }}
            />
          ) : view === 'exports' ? (
            <AdminExports eventId={selectedEvent} />
          ) : view === 'entries' ? (
            <AdminEntries
              filterRevision={entriesTarget.revision}
              initialFilters={entriesTarget.filters}
              onFiltersConsumed={() =>
                setEntriesTarget((current) => ({ ...current, filters: {} }))
              }
              preview={
                previewViewport && previewOpen && !detailOpen
                  ? entryPreview
                  : undefined
              }
              // Below the preview breakpoint a row opens its detail; a stale selection never covers the list.
              mobilePreviewOpen={false}
              eventId={selectedEvent}
              onEventChange={changeEvent}
              onTotalChange={setEntryCount}
              detailOpen={detailOpen}
              autoPreview={previewViewport}
              autoSelectFirst={previewViewport && previewOpen}
              onOpenDetail={() => {
                setDetailOpen(true);
                setPreviewOpen(false);
              }}
              onCloseDetail={() => {
                setDetailOpen(false);
                // A6 mobile returns to the list; only the wide workspace reopens its inline preview.
                setPreviewOpen(previewViewport);
              }}
              onClosePreview={closePreview}
              onMessage={openMessages}
              onSelectionChange={handleSelectionChange}
              onWorkflowChange={setPreviewWorkflow}
              entriesRevision={entriesRevision}
              previewAdvance={previewAdvance}
              onPreviewAdvanceHandled={() => setPreviewAdvance(null)}
              selectedEntry={selectedEntry}
            />
          ) : view === 'messages' ? (
            <AdminMessages
              key={selectedEvent}
              eventId={selectedEvent}
              seed={messageSeed ?? undefined}
            />
          ) : view === 'workflow' ? (
            <AdminWorkflow eventId={selectedEvent} events={events} />
          ) : view === 'setup' ? (
            <EventSetup
              eventId={selectedEvent}
              onCreated={(event) => {
                setEvents((current) => [
                  ...current.filter((item) => item.id !== event.id),
                  { ...event, registrationClosesAt: null },
                ]);
                changeEvent(event.id);
              }}
            />
          ) : view === 'modules' && identity?.canManageModules ? (
            <AdminModules />
          ) : view === 'account' ? (
            <AccountSettings>
              <EventDocumentSettings
                eventId={selectedEvent}
                onSaved={() => {
                  // Configuration changes invalidate the selected entry's document projection too.
                  setSelectedEntry(null);
                  entriesChanged();
                }}
              />
              <RegistrationFormSettings eventId={selectedEvent} />
            </AccountSettings>
          ) : null
        }
      </AppShell>
    </SessionPermissions.Provider>
  );
}
