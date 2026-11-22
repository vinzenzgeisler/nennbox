import { useEffect, useState, type ReactNode } from 'react';
import {
  AdminNavigation,
  AdminWorkspace,
  CommandPalette,
  PageHeader,
  Signet,
  SelectField,
  type IconName,
} from '@nennbox/ui';
import { entrySearchCommand, shellCommands } from './shellCommands.js';
import { useCommandShortcut } from './useCommandShortcut.js';

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
type View =
  | 'overview'
  | 'entries'
  | 'workflow'
  | 'setup'
  | 'account'
  | 'exports'
  | 'messages';
const VIEW_TITLES: Record<View, string> = {
  overview: 'Übersicht',
  exports: 'Exporte',
  entries: 'Nennungen',
  workflow: 'Nennungsablauf',
  setup: 'Veranstaltung einrichten',
  account: 'Einstellungen',
  messages: 'Nachrichten',
};
type NavItem = {
  id: View;
  label: string;
  icon: IconName;
  mobile?: boolean;
  mobileLabel?: string;
};
export const APP_NAVIGATION_REGISTRY: Array<{
  label: string;
  items: NavItem[];
}> = [
  {
    label: 'Veranstaltung',
    items: [
      {
        id: 'overview',
        label: 'Übersicht',
        mobileLabel: 'Start',
        icon: 'overview',
      },
      { id: 'entries', label: 'Nennungen', icon: 'list' },
      {
        id: 'workflow',
        label: 'Nennungsablauf',
        icon: 'check',
        mobile: false,
      },
      {
        id: 'setup',
        label: 'Einrichten',
        mobileLabel: 'Event',
        icon: 'calendar',
      },
    ],
  },
  {
    label: 'Kommunikation',
    items: [
      {
        id: 'messages',
        label: 'Nachrichten',
        mobileLabel: 'Post',
        icon: 'mail',
      },
    ],
  },
  {
    label: 'Konto',
    items: [
      { id: 'exports', label: 'Exporte', icon: 'export' },
      {
        id: 'account',
        label: 'Einstellungen',
        mobileLabel: 'Konto',
        icon: 'settings',
      },
    ],
  },
];
export function AppShell({
  children,
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
}: {
  children: ReactNode | ((view: View) => ReactNode);
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
  const currentView = messageEntryId && view === 'entries' ? 'messages' : view;
  const selectedEvent = events.find((event) => event.id === activeEvent);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewOpen) {
        onClosePreview?.();
        document
          .querySelector<HTMLButtonElement>('[data-selected-entry]')
          ?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClosePreview, previewOpen]);
  const closeDate = selectedEvent?.registrationClosesAt
    ? new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin',
      }).format(new Date(selectedEvent.registrationClosesAt))
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
  const navigationItems = APP_NAVIGATION_REGISTRY.flatMap(
    (group) => group.items,
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
  const palette = (
    <CommandPalette
      open={commandOpen}
      onClose={() => setCommandOpen(false)}
      items={shellCommands({
        navigation: navigationItems,
        events,
        activeEvent,
        navigate,
        changeEvent: (id) => onEventChange?.(id),
      })}
      {...(onEntrySearch
        ? {
            queryItems: entrySearchCommand((search) => {
              onClearMessageSelection?.();
              onEntrySearch(search);
            }),
          }
        : {})}
    />
  );
  return (
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
          events={events.map((event) => ({ id: event.id, label: event.name }))}
          selectedEvent={activeEvent}
          onEventChange={(id) => onEventChange?.(id)}
          groups={APP_NAVIGATION_REGISTRY.map((group) => ({
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
            eyebrow={eventBreadcrumb}
            description={
              currentView === 'entries' && closeDate
                ? `Nennungsschluss  ${closeDate.replace(', ', ' · ')}`
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
  );
}
