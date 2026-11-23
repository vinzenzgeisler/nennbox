import { useEffect, useRef, useState } from 'react';
import { initialQuery, type EntryQuery } from './AdminEntriesModel.js';
import type { EntryFilters } from '../overview/overviewModel.js';
import { useEntrySearch } from './useEntrySearch.js';

const keys = Object.keys(initialQuery) as Array<keyof EntryQuery>;

function readLocation(eventId: string, filters: EntryFilters = {}) {
  const params = new URLSearchParams(window.location.search);
  const query = { ...initialQuery };
  const matchesEvent =
    !params.get('eventId') || params.get('eventId') === eventId;
  const hasTarget = Object.keys(filters).length > 0;
  if (matchesEvent && !hasTarget) {
    for (const key of keys) {
      const value = params.get(key);
      if (value !== null) query[key] = value;
    }
  }
  if (
    ![
      'createdAt',
      'requestedStartNumber',
      'acceptanceStatus',
      'verificationStatus',
    ].includes(query.sort)
  )
    query.sort = initialQuery.sort;
  if (!['asc', 'desc'].includes(query.direction))
    query.direction = initialQuery.direction;
  const pageValue = Number(params.get('page'));
  const page =
    matchesEvent &&
    !hasTarget &&
    Number.isSafeInteger(pageValue) &&
    pageValue > 0
      ? pageValue
      : 1;
  return {
    query: { ...query, ...filters },
    page: Object.keys(filters).length ? 1 : page,
  };
}

/** Filter history is local view state: never navigate or dispatch synthetic popstate. */
export function useEntryFilters(
  eventId: string,
  initialFilters: EntryFilters,
  filterRevision: number,
  clearSelection: () => void,
) {
  const [initial] = useState(() => readLocation(eventId, initialFilters));
  const [draft, setDraft] = useState<EntryQuery>(initial.query);
  const [applied, setApplied] = useState<EntryQuery>(initial.query);
  const [page, setPage] = useState(initial.page);
  const revision = useRef(filterRevision);
  const firstWrite = useRef(true);
  const restoring = useRef(false);

  useEffect(() => {
    if (revision.current === filterRevision) return;
    revision.current = filterRevision;
    const query = { ...initialQuery, ...initialFilters };
    // Explicit overview/palette targets update the mounted list, not its identity.
    setDraft(query);
    setApplied(query);
    setPage(1);
    clearSelection();
  }, [filterRevision, initialFilters, clearSelection]);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('eventId') && params.get('eventId') !== eventId) return;
      restoring.current = true;
      const state = readLocation(eventId);
      setDraft(state.query);
      setApplied(state.query);
      setPage(state.page);
      clearSelection();
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [eventId, clearSelection]);

  useEntrySearch(draft, applied, setApplied, setPage, clearSelection);

  useEffect(() => {
    if (!eventId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('eventId', eventId);
    for (const key of keys) {
      if (applied[key] === initialQuery[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, applied[key]);
    }
    if (page === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(page));
    if (url.href !== window.location.href) {
      window.history[
        firstWrite.current || restoring.current ? 'replaceState' : 'pushState'
      ](window.history.state, '', url);
    }
    firstWrite.current = false;
    restoring.current = false;
  }, [eventId, applied, page]);

  return { draft, setDraft, applied, setApplied, page, setPage };
}
