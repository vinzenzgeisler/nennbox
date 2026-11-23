import { usePreviewStatusChange } from './usePreviewStatusChange.js';
import { EntryStatusToast } from '../entries/EntryStatusToast.js';
import { PreviewPanel, useWorkspacePreview } from '@nennbox/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
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
  const [events, setEvents] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      registrationClosesAt: string | null;
      status: 'draft' | 'open' | 'closed' | 'archived';
    }>
  >([]);
  const [entryCount, setEntryCount] = useState(0);
  const [entriesTarget, setEntriesTarget] = useState<{
    revision: number;
    filters: EntryFilters;
  }>({ revision: 0, filters: {} });
  const [selectedEvent, setSelectedEvent] = useState('');

  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [messageSeed, setMessageSeed] = useState<MessageSeed | null>(null);
  const [previewWorkflow, setPreviewWorkflow] = useState<WorkflowView | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const closePreview = () => setPreviewOpen(false);
  const activeEvent = useRef('');
  /** One place for leaving an event: nothing of the old one may stay selected, open or busy. */
  const changeEvent = useCallback((id: string) => {
    activeEvent.current = id;
    setSelectedEvent(id);
    setEntriesTarget((current) => ({ ...current, filters: {} }));
    setSelectedEntry(null);
    setMessageSeed(null);
    setDetailOpen(false);
    setPreviewOpen(true);
    setPreviewBusy(false);
  }, []);
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
    [previewViewport],
  );
  const handleSelectionChange = useCallback((entry: Entry | null) => {
    setSelectedEntry(entry);
    if (entry) setPreviewOpen(true);
    else setDetailOpen(false);
  }, []);
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/events', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (!active || !Array.isArray(rows)) return;
        const parsed = rows.flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const value = row as {
            id?: unknown;
            name?: unknown;
            slug?: unknown;
            registrationClosesAt?: unknown;
            status?: unknown;
          };
          return typeof value.id === 'string' && typeof value.name === 'string'
            ? [
                {
                  id: value.id,
                  name: value.name,
                  slug: typeof value.slug === 'string' ? value.slug : '',
                  registrationClosesAt:
                    typeof value.registrationClosesAt === 'string'
                      ? value.registrationClosesAt
                      : null,
                  status: (value.status === 'open' ||
                  value.status === 'closed' ||
                  value.status === 'archived'
                    ? value.status
                    : 'draft') as 'draft' | 'open' | 'closed' | 'archived',
                },
              ]
            : [];
        });
        setEvents(parsed);
        const first = parsed[0]?.id ?? '';
        setSelectedEvent((current) => current || first);
        activeEvent.current = activeEvent.current || first;
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
  const openMessages = useCallback((seed: MessageSeed) => {
    setMessageSeed(seed);
    setDetailOpen(false);
    setPreviewOpen(false);
  }, []);
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
  ) : (
    <PreviewPanel eyebrow="Vorschau" title="Nennung auswählen" />
  );
  return (
    <AppShell
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
            preview={previewOpen && !detailOpen ? entryPreview : undefined}
            mobilePreviewOpen={
              previewOpen && !detailOpen && Boolean(selectedEntry)
            }
            eventId={selectedEvent}
            onEventChange={changeEvent}
            onTotalChange={setEntryCount}
            detailOpen={detailOpen}
            autoPreview={previewViewport}
            onOpenDetail={() => {
              setDetailOpen(true);
              setPreviewOpen(false);
            }}
            onCloseDetail={() => {
              setDetailOpen(false);
              // A6 mobile returns to the list; only the wide workspace reopens its inline preview.
              setPreviewOpen(previewViewport);
            }}
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
          <>
            <EventDocumentSettings eventId={selectedEvent} />
            <RegistrationFormSettings eventId={selectedEvent} />
          </>
        ) : null
      }
    </AppShell>
  );
}
