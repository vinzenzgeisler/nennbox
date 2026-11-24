import { useEntryQuickRequest } from './useEntryQuickRequest.js';
import { useEntryBulkSelection } from './EntrySelectionState.js';
import { EntryDetailHost } from './detail/EntryDetailHost.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EntryEventPicker } from './EntryEventPicker.js';
import { EntryStatusToast } from './EntryStatusToast.js';
import { useEntryListStatusChanges } from './useEntryListStatusChanges.js';
import { applyEntrySort, initialQuery } from './AdminEntriesModel.js';
import { AdminEntriesState } from './AdminEntriesState.js';
import { AdminEntryList } from './AdminEntryList.js';
import { useAdminEntryActions } from './useAdminEntryActions.js';
import { useAdminEntriesData } from './useAdminEntriesData.js';
import { useAdminEntriesKeyboard } from './useAdminEntriesKeyboard.js';
import { usePreviewAdvance } from './usePreviewAdvance.js';
import { useOpenEntryDetail } from './useOpenEntryDetail.js';
import { useEntryChangesRefresh } from './useEntryChangesRefresh.js';
import { useSharedSelection } from './useSharedSelection.js';
import type { AdminEntriesProps } from './AdminEntriesProps.js';
import { useAutoPreviewEntry } from './useAutoPreviewEntry.js';
import { useEntryCounts } from './useEntryCounts.js';
import { useEntryDetailNavigation } from './useEntryDetailNavigation.js';
import { useEntryFilters } from './useEntryFilters.js';

/** Event changes reset view state and cancel requests scoped to the previous event. */

export function AdminEntries(props: AdminEntriesProps = {}) {
  return <AdminEntriesView key={props.eventId ?? 'standalone'} {...props} />;
}

function AdminEntriesView({
  detailOpen,
  preview,
  mobilePreviewOpen,
  autoPreview = false,
  autoSelectFirst = autoPreview,
  onOpenDetail,
  onMessage,
  onCloseDetail,
  onClosePreview,
  onSelectionChange,
  onWorkflowChange,
  entriesRevision = 0,
  previewAdvance = null,
  onPreviewAdvanceHandled,
  selectedEntry: sharedSelectedEntry,
  onTotalChange,
  eventId: sharedEventId,
  initialFilters = {},
  filterRevision = 0,
  onFiltersConsumed,
  onEventChange: onSharedEventChange,
}: AdminEntriesProps) {
  const [internalDetailOpen, setInternalDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const isDetailOpen = detailOpen ?? internalDetailOpen;
  const openDetail = useCallback(() => {
    if (onOpenDetail) onOpenDetail();
    else setInternalDetailOpen(true);
  }, [onOpenDetail]);
  const closeDetail = useCallback(() => {
    if (onCloseDetail) onCloseDetail();
    else setInternalDetailOpen(false);
  }, [onCloseDetail]);
  const [localEventId, setLocalEventId] = useState(
    () => new URLSearchParams(window.location.search).get('eventId') ?? '',
  );
  const eventId = sharedEventId ?? localEventId;
  const pageSize = 12;
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [selected, setSelected] = useSharedSelection(
    sharedSelectedEntry,
    onSelectionChange,
  );
  const [actionError, setActionError] = useState('');
  const counts = useEntryCounts(eventId, refreshRevision, onTotalChange);
  const [selection, setSelection] = useEntryBulkSelection(eventId);
  const selectedIds =
    selection.eventId === eventId ? selection.ids : new Set<string>();
  const clearSelection = useCallback(
    () => setSelection({ eventId, ids: new Set() }),
    [eventId, setSelection],
  );
  const { draft, setDraft, applied, setApplied, page, setPage } =
    useEntryFilters(
      eventId,
      initialFilters,
      filterRevision,
      clearSelection,
      onFiltersConsumed,
    );
  const {
    apiState,
    events,
    workflow,
    workflowError,
    retryWorkflow,
    retryEntries,
    items: listItems,
    total,
    totalPages,
    classes,
    resetData,
  } = useAdminEntriesData({
    eventId,
    page,
    pageSize,
    applied,
    refreshRevision,
    setActionError,
  });
  // Saved detail responses update the hidden list immediately, before its refetch.
  const items = useMemo(
    () => listItems.map((item) => (item.id === selected?.id ? selected : item)),
    [listItems, selected],
  );
  useEffect(() => onWorkflowChange?.(workflow), [onWorkflowChange, workflow]);
  const {
    setReason,
    busy,
    setBusy,
    openEntry,
    transition,
    eligibleSelectedItems,
    bulkAccept,
    bulkNotice,
    clearBulkNotice,
    invalidateActionRequests,
  } = useAdminEntryActions({
    eventId,
    items,
    workflow,
    selected,
    setSelected,
    selectedIds,
    clearSelection,
    setRefreshRevision,
    setActionError,
  });
  const { changeStatus, notice, clearNotice, showNotice } =
    useEntryListStatusChanges({
      eventId,
      workflow,
      setSelected,
      setRefreshRevision,
      setActionError,
    });
  const detailNavigation = useEntryDetailNavigation({
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
  });
  const openEntryDetail = useOpenEntryDetail(selected, openEntry, openDetail);
  const quick = useEntryQuickRequest(openEntryDetail);
  useAutoPreviewEntry({
    autoSelectFirst,
    eventId,
    items,
    workflow,
    selected,
    openEntry,
  });
  usePreviewAdvance({
    eventId,
    items,
    workflow,
    openEntry,
    setRefreshRevision,
    entriesRevision,
    previewAdvance,
    onPreviewAdvanceHandled,
  });
  useEntryChangesRefresh(setRefreshRevision);
  useAdminEntriesKeyboard({
    items,
    selected,
    isDetailOpen,
    openEntry,
    openDetail,
    closeDetail,
    closePreview: onClosePreview,
    setSelected,
  });

  function changeEvent(nextEventId: string) {
    resetData();
    invalidateActionRequests();
    if (onSharedEventChange) onSharedEventChange(nextEventId);
    else setLocalEventId(nextEventId);
    setPage(1);
    clearSelection();
    setDraft({ ...initialQuery });
    setApplied({ ...initialQuery });
    setSelected(null);
    closeDetail();
    setReason('');
    setActionError('');
    setBusy(false);
  }

  function changeSort(nextSort: string, nextDirection = draft.direction) {
    applyEntrySort(
      nextSort,
      nextDirection,
      setDraft,
      setPage,
      clearSelection,
      setApplied,
    );
  }

  // A reload while the detail is open must not replace it: it would lose open dialogs such as a freshly created link.
  const waitingForEvents = !events.length && apiState !== 'ready';
  if (waitingForEvents && !(isDetailOpen && selected))
    return <AdminEntriesState state={apiState} />;

  return (
    <section className="admin-entries" aria-labelledby="admin-entries-title">
      <h2
        id="admin-entries-title"
        className={onSharedEventChange ? 'nb-visually-hidden' : undefined}
      >
        Nennungen
      </h2>
      {!onSharedEventChange && (
        <EntryEventPicker
          events={events}
          eventId={eventId}
          onChange={changeEvent}
        />
      )}
      {!(isDetailOpen && selected) && (
        <AdminEntryList
          onQuickAction={quick.onQuickAction}
          canMessage={Boolean(onMessage)}
          preview={preview}
          mobilePreviewOpen={mobilePreviewOpen}
          eventId={eventId}
          apiState={apiState}
          workflowError={workflowError}
          onRetryWorkflow={retryWorkflow}
          onRetry={retryEntries}
          draft={draft}
          setDraft={setDraft}
          changeSort={changeSort}
          counts={counts}
          classes={classes}
          workflow={workflow}
          total={total}
          items={items}
          selected={selected}
          selectedIds={selectedIds}
          setSelection={setSelection}
          openEntry={autoPreview ? openEntry : openEntryDetail}
          openDetail={openEntryDetail}
          onChangeStatus={changeStatus}
          eligibleSelectedItems={eligibleSelectedItems}
          busy={busy}
          clearSelection={clearSelection}
          bulkAccept={bulkAccept}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
        />
      )}
      {isDetailOpen && selected && (
        <EntryDetailHost
          activeTab={detailTab}
          onTab={setDetailTab}
          navigate={detailNavigation.navigate}
          navigationBusy={detailNavigation.busy}
          quickActionRequest={quick.request}
          onQuickActionHandled={quick.clear}
          key={selected.id}
          selected={selected}
          classes={classes}
          workflow={workflow}
          busy={busy}
          error={actionError}
          transition={transition}
          onBack={closeDetail}
          onOpenRelated={openEntryDetail}
          onMessage={onMessage}
          onChangeStatus={changeStatus}
          onNotice={showNotice}
          items={items}
          page={page}
          pageSize={pageSize}
          total={total}
          setSelected={setSelected}
          setRefreshRevision={setRefreshRevision}
        />
      )}

      <EntryStatusToast
        notice={notice ?? bulkNotice}
        clear={notice ? clearNotice : clearBulkNotice}
      />
      {actionError && !(isDetailOpen && selected) && (
        <p role="alert">{actionError}</p>
      )}
    </section>
  );
}
