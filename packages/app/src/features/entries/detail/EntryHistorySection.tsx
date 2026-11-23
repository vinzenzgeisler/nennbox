import { relativeEntryTime } from './relativeEntryTime.js';
import { DetailSection, HistoryTimeline } from '@nennbox/ui';
import { type TimelineItem } from './entryDetailModel.js';

export function EntryHistorySection({
  items,
  title = 'Verlauf',
}: {
  items: TimelineItem[];
  title?: string;
}) {
  return (
    <DetailSection title={title}>
      <HistoryTimeline
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          time: relativeEntryTime(item.occurredAt),
          dateTime: item.occurredAt,
          actor: item.actor,
          tone: item.tone,
          detail: item.detail,
        }))}
        empty={<p>Noch keine Einträge.</p>}
      />
    </DetailSection>
  );
}
