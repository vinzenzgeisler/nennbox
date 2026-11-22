import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { AdminEntryDetail } from '../AdminEntryDetail.js';
import { EntryDetailNavigation } from './EntryDetailNavigation.js';
export function EntryDetailHost({
  items,
  page,
  pageSize,
  total,
  openEntry,
  setSelected,
  setRefreshRevision,
  ...props
}: Omit<ComponentProps<typeof AdminEntryDetail>, 'onUpdated' | 'navigation'> & {
  items: Entry[];
  page: number;
  pageSize: number;
  total: number;
  openEntry: (id: string) => Promise<void>;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
  setRefreshRevision: Dispatch<SetStateAction<number>>;
}) {
  return (
    <AdminEntryDetail
      {...props}
      navigation={
        <EntryDetailNavigation
          items={items}
          selected={props.selected}
          page={page}
          pageSize={pageSize}
          total={total}
          busy={props.busy}
          openEntry={openEntry}
        />
      }
      onUpdated={(entry, refresh = true) => {
        setSelected(entry);
        if (refresh) setRefreshRevision((value) => value + 1);
      }}
    />
  );
}
