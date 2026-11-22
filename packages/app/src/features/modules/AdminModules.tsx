import { adminFetch } from '../../auth.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleListResponse, EventSchema } from '@nennbox/contracts';
import type { ModuleViewSchema } from '@nennbox/contracts';
import {
  AppButton,
  AppEmptyState,
  AppGrid,
  AppNotice,
  AppSection,
  AppSegmented,
  AppSelect,
  AppStatusPill,
  AppTable,
  AppTextInput,
  AppView,
} from '@nennbox/ui';
import { ModuleDisableButton } from './ModuleDisableButton.js';
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
  const base =
    scope === 'organization'
      ? '/admin/organization/modules'
      : '/admin/events/' + encodeURIComponent(eventId) + '/modules';
  const load = useCallback(async () => {
    if (scope === 'event' && !eventId) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch(base, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(String(response.status));
      setModules(ModuleListResponse.parse(await response.json()).modules);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [base, eventId, scope, t.error]);
  useEffect(() => {
    void adminFetch('/admin/events', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown[]) => {
        const parsed = rows.map((row) => EventSchema.parse(row));
        setEvents(parsed.map(({ id, name }) => ({ id, name })));
        setEventId((current) => current || parsed[0]?.id || '');
      })
      .catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
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
    payload: { enabled?: boolean; config?: unknown },
  ) {
    setError('');
    try {
      const response = await adminFetch(
        base + '/' + encodeURIComponent(module.id),
        {
          method: 'PATCH',
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
      await load();
      setSelected(null);
      setConfigErrors({});
    } catch {
      setError(t.error);
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
          onChange={(next) => setScope(next as typeof scope)}
          label={t.scope}
        />
        {scope === 'event' && (
          <AppSelect
            label={t.chooseEvent}
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
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
        <AppTable headers={[t.module, t.description, t.status, t.actions]}>
          {filtered.map((module) => (
            <tr key={module.id}>
              <td>
                <strong>{module.gallery.name[locale]}</strong>
              </td>
              <td>{module.gallery.shortDescription[locale]}</td>
              <td>
                {module.status === 'unavailable' ? (
                  <AppStatusPill status="neg">
                    {t[module.unavailableReason ?? 'edition']}
                  </AppStatusPill>
                ) : module.enabled ? (
                  <AppStatusPill status="zu">{t.active}</AppStatusPill>
                ) : (
                  <AppStatusPill status="offen">{t.inactive}</AppStatusPill>
                )}
              </td>
              <td>
                <div className="nb-app-inline">
                  <AppButton
                    tone="ghost"
                    onClick={() => {
                      setSelected(module);
                      setConfig(module.config);
                      setConfigErrors({});
                    }}
                  >
                    {t.details}
                  </AppButton>
                  {module.status === 'unavailable' ? (
                    module.unavailableReason === 'entitlement' && onUpgrade ? (
                      <AppButton
                        tone="secondary"
                        onClick={() => onUpgrade(module.id)}
                      >
                        {t.upgrade}
                      </AppButton>
                    ) : null
                  ) : module.enabled ? (
                    <ModuleDisableButton
                      locale={locale}
                      onConfirm={() => void change(module, { enabled: false })}
                    />
                  ) : (
                    <AppButton
                      tone="secondary"
                      onClick={() => void change(module, { enabled: true })}
                    >
                      {t.activate}
                    </AppButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AppTable>
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
