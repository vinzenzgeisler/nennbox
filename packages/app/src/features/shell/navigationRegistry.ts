import type { IconName } from '@nennbox/ui';

export type View = keyof typeof VIEW_TITLES;
export const VIEW_TITLES = {
  overview: 'Übersicht',
  exports: 'Exporte',
  entries: 'Nennungen',
  workflow: 'Nennungsablauf',
  setup: 'Veranstaltung einrichten',
  account: 'Einstellungen',
  messages: 'Nachrichten',
  modules: 'Module',
};
export type NavItem = {
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
        icon: 'mail',
      },
    ],
  },
  {
    label: 'Konto',
    items: [
      { id: 'exports', label: 'Exporte', icon: 'export', mobile: false },
      {
        id: 'account',
        label: 'Einstellungen',
        icon: 'settings',
        mobile: false,
      },
    ],
  },
];
