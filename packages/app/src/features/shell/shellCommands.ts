import type { CommandItem, IconName } from '@nennbox/ui';

type NavigationTarget = { id: string; label: string; icon: IconName };
type EventTarget = { id: string; name: string };

const SETTINGS = 'Einstellungen';
const JUMP = 'Springen zu';

/**
 * Settings reachable from „Suchen und springen“. Each one opens the area
 * that already edits it; the palette adds no function of its own.
 */
const SETTING_COMMANDS: Array<{
  id: string;
  target: string;
  label: string;
  detail: string;
  keywords: string[];
}> = [
  {
    id: 'workflow',
    target: 'workflow',
    label: 'Nennungsablauf bearbeiten',
    detail: 'Status und Übergänge',
    keywords: ['Nennungsstatus', 'Rollen'],
  },
  {
    id: 'setup',
    target: 'setup',
    label: 'Veranstaltung einrichten',
    detail: 'Klassen, Startgeld und Bedingungen',
    keywords: ['Einrichten', 'Startnummern', 'Warteliste', 'Fahrer-Portal'],
  },
  {
    id: 'documents',
    target: 'account',
    label: 'Nennungsunterlagen bearbeiten',
    detail: 'Einstellungen',
    keywords: ['Unterlagen', 'Dokumente'],
  },
  {
    id: 'registration-form',
    target: 'account',
    label: 'Nennformular bearbeiten',
    detail: 'Einstellungen',
    keywords: ['Formularfelder', 'Erscheinungsbild', 'Eigene Felder'],
  },
];

/** Areas of the main navigation that are places, not settings. */
const JUMP_TARGETS = ['overview', 'entries', 'messages', 'exports'];

export function shellCommands({
  navigation,
  events,
  activeEvent,
  navigate,
  changeEvent,
}: {
  navigation: NavigationTarget[];
  events: EventTarget[];
  activeEvent: string;
  navigate: (id: string) => void;
  changeEvent: (id: string) => void;
}): CommandItem[] {
  const iconOf = (id: string) =>
    navigation.find((item) => item.id === id)?.icon ?? 'next';
  const available = new Set(navigation.map((item) => item.id));
  const otherEvents = events.filter((event) => event.id !== activeEvent);
  return [
    ...SETTING_COMMANDS.filter((command) => available.has(command.target)).map(
      (command): CommandItem => ({
        id: command.id,
        label: command.label,
        detail: command.detail,
        keywords: command.keywords,
        icon: iconOf(command.target),
        group: SETTINGS,
        onSelect: () => navigate(command.target),
      }),
    ),
    ...navigation
      .filter((item) => JUMP_TARGETS.includes(item.id))
      .map((item): CommandItem => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        group: JUMP,
        onSelect: () => navigate(item.id),
      })),
    ...(otherEvents.length
      ? [
          {
            id: 'change-event',
            label: 'Veranstaltung wechseln',
            icon: 'switch' as const,
            group: JUMP,
            childrenPlaceholder: 'Veranstaltung suchen',
            children: otherEvents.map((event): CommandItem => ({
              id: `event-${event.id}`,
              label: event.name,
              detail: 'Veranstaltung',
              icon: 'calendar',
              group: 'Veranstaltung wechseln',
              onSelect: () => changeEvent(event.id),
            })),
          },
        ]
      : []),
  ];
}

/** The free-text item: opens the entries filtered by the typed text. */
export const entrySearchCommand =
  (search: (query: string) => void) =>
  (query: string): CommandItem[] => [
    {
      id: 'entry-search',
      label: `Nennungen nach „${query}“ suchen`,
      icon: 'search',
      group: JUMP,
      onSelect: () => search(query),
    },
  ];
