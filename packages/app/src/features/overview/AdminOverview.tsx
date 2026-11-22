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
};

/** Key figures of the selected event; keyed by event so nothing carries over. */
export function AdminOverview({
  eventId,
  onOpenEntries,
  onTotalChange,
}: Props) {
  return eventId ? (
    <OverviewForEvent
      key={eventId}
      eventId={eventId}
      onOpenEntries={onOpenEntries}
      onTotalChange={onTotalChange}
    />
  ) : (
    <NoEventSelected appDesign />
  );
}

function OverviewForEvent({ eventId, onOpenEntries, onTotalChange }: Props) {
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
  if (!hasContent)
    return (
      <AppEmptyState
        title="Noch keine Nennungen"
        description="Sobald die ersten Nennungen eingehen, erscheinen hier Kennzahlen, Belegung und Hinweise."
      />
    );
  return (
    <AppView>
      <OverviewWarnings
        eventId={eventId}
        warnings={overview.warnings}
        onOpenEntries={onOpenEntries}
      />
      <OverviewMetrics overview={overview} />
      <AppGrid columns="two">
        <OverviewStatuses statuses={overview.statuses} />
        <OverviewClasses classes={overview.classes} />
      </AppGrid>
    </AppView>
  );
}
