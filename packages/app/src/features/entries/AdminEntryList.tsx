import type { OnEntryQuickAction } from './entryQuickActions.js';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import {
  DataTable,
  Pagination,
  SelectionBar,
  TabList,
  TabPanel,
  WorkspaceSplit,
} from '@nennbox/ui';
import type {
  ApiState,
  EntryQuery,
  WorkflowView,
} from './AdminEntriesModel.js';
import { AdminEntryRow } from './AdminEntryRow.js';
import { AdminEntryFilters } from './AdminEntryFilters.js';
import { AdminEntryListStatus } from './AdminEntryListStatus.js';

type Selection = { eventId: string; ids: Set<string> };
type Props = {
  onQuickAction?: OnEntryQuickAction | undefined;
  canMessage?: boolean | undefined;
  preview?: ReactNode;
  mobilePreviewOpen?: boolean | undefined;
  eventId: string;
  apiState: ApiState;
  workflowError?: ApiState | null | undefined;
  onRetry?: (() => void | Promise<void>) | undefined;
  onRetryWorkflow?: (() => void) | undefined;
  draft: EntryQuery;
  setDraft: Dispatch<SetStateAction<EntryQuery>>;
  changeSort: (sort: string, direction?: string) => void;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
  counts: Record<string, number>;
  total: number;
  items: Entry[];
  selected: Entry | null;
  selectedIds: Set<string>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  openEntry: (id: string) => Promise<void>;
  openDetail?: (id: string) => Promise<void>;
  onChangeStatus: (entry: Entry, status: string) => Promise<void>;
  eligibleSelectedItems: Entry[];
  busy: boolean;
  clearSelection: () => void;
  bulkAccept: () => Promise<void>;
  page: number;
  totalPages: number;
  setPage: Dispatch<SetStateAction<number>>;
};
export function AdminEntryList(props: Props) {
  const {
    preview,
    mobilePreviewOpen,
    eventId,
    apiState,
    draft,
    setDraft,
    changeSort,
    classes,
    workflow,
    counts,
    total,
    items,
    selected,
    selectedIds,
    setSelection,
    openEntry,
    openDetail,
    onChangeStatus,
    eligibleSelectedItems,
    busy,
    clearSelection,
    bulkAccept,
    page,
    totalPages,
    setPage,
  } = props;
  if (!eventId) return null;
  const countAll = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const content = (
    <>
      <AdminEntryListStatus
        apiState={apiState}
        total={total}
        workflowError={props.workflowError}
        onRetry={props.onRetry}
        onRetryWorkflow={props.onRetryWorkflow}
      />
      <DataTable
        headerCellClassNames={[
          'nb-entry-column-label',
          undefined,
          undefined,
          undefined,
          undefined,
          'nb-entry-column-label',
        ]}
        headers={[
          'Auswahl',
          'Nennung',
          'Klasse',
          'Status',
          'Vollständigkeit',
          'Aktionen',
        ]}
      >
        {apiState === 'ready' &&
          items.map((entry) => (
            <AdminEntryRow
              key={entry.id}
              entry={entry}
              eventId={eventId}
              selected={selected}
              selectedIds={selectedIds}
              setSelection={setSelection}
              classes={classes}
              workflow={workflow}
              openEntry={openEntry}
              openDetail={openDetail}
              onChangeStatus={onChangeStatus}
              onQuickAction={props.onQuickAction}
              canMessage={props.canMessage}
            />
          ))}
        {apiState === 'ready' && !items.length && (
          <tr>
            <td colSpan={6}>Keine Nennungen für diese Filter.</td>
          </tr>
        )}
      </DataTable>
      <Pagination
        page={page}
        pageCount={totalPages}
        previousLabel="Zurück"
        nextLabel="Weiter"
        pageLabel={(current, count) => `Seite ${current} von ${count}`}
        onPageChange={(next) => {
          if (apiState === 'loading') return;
          clearSelection();
          setPage(next);
        }}
      />
    </>
  );
  const tabs = [
    { id: 'all', label: 'Alle', count: countAll },
    ...(workflow?.statuses ?? []).map((status) => ({
      id: status.key,
      label: status.labels.de,
      count: counts[status.key] ?? 0,
    })),
  ];
  const selectedTab = draft.acceptanceStatus || 'all';
  return (
    <WorkspaceSplit
      previewLabel="Nennungsvorschau"
      preview={preview}
      mobilePreviewOpen={mobilePreviewOpen}
      filters={
        <AdminEntryFilters
          draft={draft}
          setDraft={setDraft}
          changeSort={changeSort}
          classes={classes}
          tabs={
            <TabList
              tabs={tabs}
              selected={selectedTab}
              label="Nennungsstatus"
              onChange={(id) =>
                setDraft((value) => ({
                  ...value,
                  acceptanceStatus: id === 'all' ? '' : id,
                }))
              }
            />
          }
        />
      }
    >
      <TabPanel
        id={tabs.some((tab) => tab.id === selectedTab) ? selectedTab : 'all'}
      >
        {content}
      </TabPanel>
      {selectedIds.size > 0 && (
        <SelectionBar
          label="Massenaktionen"
          summary={`${selectedIds.size} von ${total} ausgewählt`}
          clearLabel="Auswahl aufheben"
          onClear={clearSelection}
          actionLabel={`Zulassen (${eligibleSelectedItems.length} von ${selectedIds.size})`}
          actionDisabled={busy || eligibleSelectedItems.length === 0}
          onAction={() => void bulkAccept()}
        />
      )}
    </WorkspaceSplit>
  );
}
