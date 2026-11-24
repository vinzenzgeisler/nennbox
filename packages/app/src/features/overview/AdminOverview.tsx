import { WorkbasketOverview } from '../workbasket/WorkbasketOverview.js';
import { useCallback, useEffect } from 'react';
import { AppEmptyState, AppView, AppGrid } from '@nennbox/ui';
import {
  LoadingNotice,
  NoEventSelected,
  RemoteError,
} from '../remote/RemoteNotice.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';
import { OverviewClasses } from './OverviewClasses.js';
import { OverviewMetrics } from './OverviewMetrics.js';
import { OverviewStatuses } from './OverviewStatuses.js';
import { OverviewWarnings } from './OverviewWarnings.js';
import { overviewApi } from './overviewApi.js';
import { totalEntries, type EntryFilters } from './overviewModel.js';

type Props = {
  eventId: string;
  onOpenEntries: (filters: EntryFilters) => void;
  onTotalChange: (total: number) => void;
  onOpenEntry?: (id: string) => void;
};

/** Key figures of the selected event; keyed by event so nothing carries over. */
export function AdminOverview({
  eventId,
  onOpenEntries,
  onTotalChange,
  onOpenEntry,
}: Props) {
  return eventId ? (
    <OverviewForEvent
      key={eventId}
      eventId={eventId}
      onOpenEntries={onOpenEntries}
      onTotalChange={onTotalChange}
      {...(onOpenEntry ? { onOpenEntry } : {})}
    />
  ) : (
    <NoEventSelected appDesign />
  );
}

function OverviewForEvent({
  eventId,
  onOpenEntries,
  onTotalChange,
  onOpenEntry,
}: Props) {
  const load = useCallback(
    (signal: AbortSignal) => overviewApi.load(eventId, signal),
    [eventId],
  );
  const { state, reload } = useRemoteResource(load);
  const total =
    state.status === 'ready' ? totalEntries(state.data.statuses) : null;
  useEffect(() => {
    if (total !== null) onTotalChange(total);
  }, [total, onTotalChange]);
  if (state.status === 'loading')
    return <LoadingNotice subject="Die Übersicht" />;
  if (state.status === 'error')
    return (
      <RemoteError
        appDesign
        subject="Die Übersicht"
        kind={state.kind}
        onRetry={reload}
      />
    );
  const overview = state.data;
  const hasContent =
    totalEntries(overview.statuses) > 0 || overview.classes.length > 0;
  return (
    <AppView>
      {onOpenEntry && (
        <WorkbasketOverview
          eventId={eventId}
          onOpenEntry={onOpenEntry}
          onOpenClass={(classId) => onOpenEntries({ classId })}
        />
      )}
      {!hasContent && (
        <AppEmptyState
          title="Noch keine Nennungen"
          description="Sobald die ersten Nennungen eingehen, erscheinen hier Kennzahlen, Belegung und Hinweise."
        />
      )}
      <OverviewWarnings
        eventId={eventId}
        warnings={overview.warnings}
        onOpenEntries={onOpenEntries}
      />
      <OverviewMetrics overview={overview} onOpenEntries={onOpenEntries} />
      <AppGrid columns="two">
        <OverviewStatuses
          statuses={overview.statuses}
          workflowStatuses={overview.workflowStatuses}
          onOpenEntries={onOpenEntries}
        />
        <OverviewClasses
          classes={overview.classes}
          onOpenEntries={onOpenEntries}
        />
      </AppGrid>
    </AppView>
  );
}
