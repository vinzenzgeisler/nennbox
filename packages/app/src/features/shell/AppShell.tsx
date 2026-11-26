import { EntrySelectionProvider } from '../entries/EntrySelectionState.js';
import { usePreviewEscape } from './usePreviewEscape.js';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { usePaletteEntries } from './usePaletteEntries.js';
import { useState, type ReactNode } from 'react';
import {
  AdminNavigation,
  AppButton,
  AdminWorkspace,
  CommandPalette,
  PageHeader,
  Signet,
  SelectField,
} from '@nennbox/ui';
import { entrySearchCommand, shellCommands } from './shellCommands.js';
import {
  APP_NAVIGATION_REGISTRY,
  VIEW_TITLES,
  type View,
} from './navigationRegistry.js';
import { useCommandShortcut } from './useCommandShortcut.js';
import { useHeadingFocusAfterPalette } from './useHeadingFocusAfterPalette.js';

export { APP_NAVIGATION_REGISTRY } from './navigationRegistry.js';

export type ShellModule = {
  id: string;
  displayName: string;
  source: 'core' | 'official' | 'private';
  enabled: boolean;
  navigationLabel?: string;
};
type EventOption = {
  id: string;
  name: string;
  slug?: string;
  registrationClosesAt?: string | null;
};
export function AppShell({
  children,
  permissions = [],
  canManageModules = false,
  previewOpen = true,
  detailOpen = false,
  identity,
  onClosePreview,
  activeEvent = '',
  events = [],
  entryCount = 0,
  onEventChange,
  messageEntryId,
  onClearMessageSelection,
  entriesNavigationRevision,
  onEntrySearch,
  onEntrySelect,
}: {
  children: ReactNode | ((view: View) => ReactNode);
  canManageModules?: boolean;
  permissions?: readonly string[];
  previewOpen?: boolean;
  detailOpen?: boolean;
  /** `organization` replaces the role under the name once it is known. */
  identity?: { name: string; role: string; organization?: string } | null;
  onClosePreview?: () => void;
  activeEvent?: string;
  events?: EventOption[];
  entryCount?: number;
  onEventChange?: (id: string) => void;
  messageEntryId?: string | null;
  onClearMessageSelection?: () => void;
  entriesNavigationRevision?: number;
  /** Opens the entries filtered by a text typed into „Suchen und springen“. */
  onEntrySearch?: (search: string) => void;
  onEntrySelect?: (entry: Entry) => void;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  useCommandShortcut(() => setCommandOpen((open) => !open));
  const [selection, setSelection] = useState<{ view: View; revision: number }>({
    view: 'entries',
    revision: 0,
  });
  const view =
    (entriesNavigationRevision ?? 0) > selection.revision
      ? 'entries'
      : selection.view;
  const requestedView =
    messageEntryId && view === 'entries' ? 'messages' : view;
  const canWrite = permissions.includes('entry:write');
  const canAdmin = permissions.includes('role:admin');
  const allowed = (id: View) =>
    ['account', 'setup', 'workflow'].includes(id)
      ? canAdmin
      : id === 'messages'
        ? canWrite
        : id === 'modules'
          ? canManageModules
          : true;
  const currentView = allowed(requestedView) ? requestedView : 'entries';
  const navigationGroups = APP_NAVIGATION_REGISTRY.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed(item.id)),
  })).filter((group) => group.items.length);
  const selectedEvent = events.find((event) => event.id === activeEvent);
  usePreviewEscape(onClosePreview, previewOpen);
  const [now] = useState(() => Date.now());
  const deadlineDays = selectedEvent?.registrationClosesAt
    ? Math.ceil(
        (new Date(selectedEvent.registrationClosesAt).getTime() - now) /
          86400000,
      )
    : null;
  const eventBreadcrumb = (
    <span className="nb-app-breadcrumb">
      <SelectField
        label="Veranstaltung"
        labelHidden
        id="nb-header-event"
        value={activeEvent}
        onChange={(event) => onEventChange?.(event.target.value)}
      >
        <option value="">Veranstaltung wählen</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
      </SelectField>
      <span aria-hidden="true">/</span>
      <span>{VIEW_TITLES[currentView]}</span>
    </span>
  );
  const navigationItems = navigationGroups
    .flatMap((group) => group.items)
    .concat(
      canManageModules
        ? [{ id: 'modules', label: 'Module', icon: 'settings' }]
        : [],
    );
  const navigate = (id: string) => {
    onClearMessageSelection?.();
    const item = navigationItems.find((entry) => entry.id === id);
    if (item)
      setSelection({
        view: item.id,
        revision: entriesNavigationRevision ?? 0,
      });
  };
  const focusHeadingAfterJump = useHeadingFocusAfterPalette(
    commandOpen,
    currentView,
  );
  const entryCommands = usePaletteEntries(
    commandOpen,
    activeEvent,
    onEntrySelect,
  );
  const palette = (
    <CommandPalette
      open={commandOpen}
      onClose={() => setCommandOpen(false)}
      items={[
        ...shellCommands({
          navigation: navigationItems,
          events,
          activeEvent,
          navigate: (id) => {
            focusHeadingAfterJump();
            navigate(id);
          },
          changeEvent: (id) => onEventChange?.(id),
        }),
        ...entryCommands,
      ]}
      {...(onEntrySearch
        ? {
            queryItems: entrySearchCommand((search) => {
              focusHeadingAfterJump();
              onClearMessageSelection?.();
              onEntrySearch(search);
            }),
          }
        : {})}
    />
  );
  return (
    <EntrySelectionProvider>
      <AdminWorkspace
        navigation={
          <AdminNavigation
            brand={
              <span className="nb-app-brand">
                <span className="nb-app-brand-icon">
                  <Signet />
                </span>
                <strong>NENNBOX</strong>
              </span>
            }
            ariaLabel="Hauptnavigation"
            eventInHeader
            onSearch={() => setCommandOpen(true)}
            eventLabel="Veranstaltung"
            eventPlaceholder="Veranstaltung wählen"
            events={events.map((event) => ({
              id: event.id,
              label: event.name,
            }))}
            selectedEvent={activeEvent}
            onEventChange={(id) => onEventChange?.(id)}
            groups={navigationGroups.map((group) => ({
              label: group.label,
              items: group.items.map((item) => ({
                ...item,
                ...(item.id === 'entries' ? { count: entryCount } : {}),
              })),
            }))}
            current={currentView}
            onNavigate={navigate}
            user={
              identity ? (
                <span className="nb-user-identity">
                  <b aria-hidden="true">
                    {identity.name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </b>
                  <span>
                    <strong>{identity.name}</strong>
                    <small>{identity.organization ?? identity.role}</small>
                  </span>
                </span>
              ) : undefined
            }
          />
        }
        header={
          detailOpen && currentView === 'entries' ? (
            <div className="nb-app-detail-breadcrumb">{eventBreadcrumb}</div>
          ) : (
            <PageHeader
              title={VIEW_TITLES[currentView]}
              actions={
                currentView === 'entries' && canWrite ? (
                  <AppButton
                    tone="primary"
                    onClick={() => navigate('messages')}
                  >
                    Nachricht schreiben
                  </AppButton>
                ) : undefined
              }
              eyebrow={eventBreadcrumb}
              description={
                currentView === 'entries' && deadlineDays !== null
                  ? deadlineDays >= 0
                    ? `Nennungsschluss in ${deadlineDays} Tagen`
                    : 'Nennungsschluss vorbei'
                  : undefined
              }
            />
          )
        }
        inset={currentView !== 'entries'}
        overlay={palette}
      >
        {typeof children === 'function' ? children(currentView) : children}
      </AdminWorkspace>
    </EntrySelectionProvider>
  );
}
