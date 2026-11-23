import { adminFetch } from '../../auth.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModuleListResponse, EventSchema } from '@nennbox/contracts';
import type { ModuleViewSchema } from '@nennbox/contracts';
import {
  AppEmptyState,
  AppGrid,
  AppNotice,
  AppSection,
  AppSegmented,
  AppSelect,
  AppTextInput,
  AppView,
} from '@nennbox/ui';
import { ModuleTable } from './ModuleTable.js';
import { updatePath } from './ModuleSchemaFields.js';
import { ModuleConfigDialog } from './ModuleConfigDialog.js';
import {
  categories,
  categoryLabels,
  words,
  type ModuleLocale,
} from './moduleWords.js';

export type Module = ReturnType<typeof ModuleViewSchema.parse>;
export function AdminModules({
  locale = 'de',
  onUpgrade,
}: {
  locale?: ModuleLocale;
  onUpgrade?: (moduleId: string) => void;
}) {
  const t = words[locale];
  const [scope, setScope] = useState<'organization' | 'event'>('organization');
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [eventId, setEventId] = useState('');
  const [modules, setModules] = useState<Module[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Module | null>(null);
  const [config, setConfig] = useState<unknown>({});
  const [configErrors, setConfigErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const listRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  function resetScope() {
    generation.current++;
    listRequest.current?.abort();
    mutationRequest.current?.abort();
    setModules([]);
    setSelected(null);
    setConfigErrors({});
    setError('');
    setLoading(true);
  }
  const base =
    scope === 'organization'
      ? '/admin/organization/modules'
      : '/admin/events/' + encodeURIComponent(eventId) + '/modules';
  const load = useCallback(async () => {
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    if (scope === 'event' && !eventId) {
      setModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch(base, {
        signal: request.signal,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(String(response.status));
      const next = ModuleListResponse.parse(await response.json()).modules;
      if (!request.signal.aborted) setModules(next);
    } catch {
      if (!request.signal.aborted) setError(t.error);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [base, eventId, scope, t.error]);
  useEffect(() => {
    const request = new AbortController();
    void adminFetch('/admin/events', {
      signal: request.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown[]) => {
        if (request.signal.aborted) return;
        const parsed = rows.map((row) => EventSchema.parse(row));
        setEvents(parsed.map(({ id, name }) => ({ id, name })));
        setEventId((current) => current || parsed[0]?.id || '');
      })
      .catch(() => {
        if (!request.signal.aborted) setEvents([]);
      });
    return () => request.abort();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      listRequest.current?.abort();
      mutationRequest.current?.abort();
    };
  }, [load]);
  const filtered = useMemo(
    () =>
      modules.filter(
        (module) =>
          (!category || module.gallery.category === category) &&
          (
            module.gallery.name[locale] +
            ' ' +
            module.gallery.shortDescription[locale] +
            ' ' +
            module.id
          )
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [modules, category, query, locale],
  );
  async function change(
    module: Module,
    payload: { enabled?: boolean; config?: unknown; reason?: string },
  ) {
    const scopeGeneration = generation.current;
    mutationRequest.current?.abort();
    const request = new AbortController();
    mutationRequest.current = request;
    const isCurrent = () =>
      !request.signal.aborted && scopeGeneration === generation.current;
    setError('');
    try {
      const response = await adminFetch(
        base + '/' + encodeURIComponent(module.id),
        {
          method: 'PATCH',
          signal: request.signal,
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            expectedVersion: module.stateVersion ?? 0,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          issues?: Array<{ path: string; message: string }>;
        } | null;
        if (!isCurrent()) return;
        if (payload.config !== undefined && body?.issues) {
          setConfigErrors(
            Object.fromEntries(
              body.issues.map((issue) => [issue.path, issue.message]),
            ),
          );
          return;
        }
        throw new Error(String(response.status));
      }
      if (!isCurrent()) return;
      await load();
      if (!isCurrent()) return;
      setSelected(null);
      setConfigErrors({});
    } catch {
      if (isCurrent()) setError(t.error);
    }
  }
  return (
    <AppView>
      <AppSection title={t.scope}>
        <AppSegmented
          options={[
            { value: 'organization', label: t.organization },
            { value: 'event', label: t.event },
          ]}
          value={scope}
          onChange={(next) => {
            resetScope();
            setScope(next as typeof scope);
          }}
          label={t.scope}
        />
        {scope === 'event' && (
          <AppSelect
            label={t.chooseEvent}
            value={eventId}
            onChange={(event) => {
              resetScope();
              setEventId(event.target.value);
            }}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </AppSelect>
        )}
      </AppSection>
      <AppSection title={t.filterLabel}>
        <AppGrid columns="two">
          <AppTextInput
            label={t.search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <AppSelect
            label={t.category}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">{t.all}</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[locale][value]}
              </option>
            ))}
          </AppSelect>
        </AppGrid>
      </AppSection>
      {loading ? (
        <AppNotice>{t.loading}</AppNotice>
      ) : error ? (
        <AppNotice tone="error">{error}</AppNotice>
      ) : filtered.length === 0 ? (
        <AppEmptyState title={t.emptyTitle} description={t.emptyDescription} />
      ) : (
        <ModuleTable
          modules={filtered}
          locale={locale}
          onUpgrade={onUpgrade}
          onDetails={(module) => {
            setSelected(module);
            setConfig(module.config);
            setConfigErrors({});
          }}
          onChange={(module, patch) => void change(module, patch)}
        />
      )}
      {selected && (
        <ModuleConfigDialog
          selected={selected}
          locale={locale}
          config={config}
          configErrors={configErrors}
          onClose={() => setSelected(null)}
          onSave={() => void change(selected, { config })}
          onChange={(path, value) => {
            setConfig((previous: unknown) => updatePath(previous, path, value));
            setConfigErrors((previous) => {
              const next = { ...previous };
              delete next[path];
              return next;
            });
          }}
        />
      )}
      {error && !loading && <AppNotice tone="error">{error}</AppNotice>}
    </AppView>
  );
}
