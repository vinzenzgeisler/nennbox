import { describe, expect, it, vi } from 'vitest';
import { APP_NAVIGATION_REGISTRY } from './AppShell.js';
import { entrySearchCommand, shellCommands } from './shellCommands.js';

const navigation = APP_NAVIGATION_REGISTRY.flatMap((group) => group.items);
const events = [
  { id: 'a', name: 'Straßenrennen 2027' },
  { id: 'b', name: 'Bergpreis 2027' },
];

describe('shellCommands', () => {
  it('lists settings first, then places of the navigation', () => {
    const commands = shellCommands({
      navigation,
      events,
      activeEvent: 'a',
      navigate: vi.fn(),
      changeEvent: vi.fn(),
    });
    expect(commands.map((item) => [item.group, item.label])).toEqual([
      ['Einstellungen', 'Nennungsablauf bearbeiten'],
      ['Einstellungen', 'Veranstaltung einrichten'],
      ['Einstellungen', 'Nennungsunterlagen bearbeiten'],
      ['Einstellungen', 'Nennformular bearbeiten'],
      ['Springen zu', 'Übersicht'],
      ['Springen zu', 'Nennungen'],
      ['Springen zu', 'Nachrichten'],
      ['Springen zu', 'Exporte'],
      ['Springen zu', 'Veranstaltung wechseln'],
    ]);
  });
  it('opens only existing navigation targets', () => {
    const navigate = vi.fn();
    const commands = shellCommands({
      navigation,
      events,
      activeEvent: 'a',
      navigate,
      changeEvent: vi.fn(),
    });
    for (const command of commands) command.onSelect?.();
    const targets = new Set(navigation.map((item) => item.id));
    expect(navigate.mock.calls.every(([id]) => targets.has(id))).toBe(true);
    expect(navigate).toHaveBeenCalledWith('account');
    const limited = shellCommands({
      navigation: navigation.filter((item) => item.id !== 'workflow'),
      events,
      activeEvent: 'a',
      navigate,
      changeEvent: vi.fn(),
    });
    expect(limited.some((item) => item.id === 'workflow')).toBe(false);
  });
  it('switches only to other events and hides the switch without one', () => {
    const changeEvent = vi.fn();
    const change = shellCommands({
      navigation,
      events,
      activeEvent: 'a',
      navigate: vi.fn(),
      changeEvent,
    }).find((item) => item.id === 'change-event')!;
    expect(change.children?.map((item) => item.label)).toEqual([
      'Bergpreis 2027',
    ]);
    change.children![0]!.onSelect?.();
    expect(changeEvent).toHaveBeenCalledWith('b');
    expect(
      shellCommands({
        navigation,
        events: events.slice(0, 1),
        activeEvent: 'a',
        navigate: vi.fn(),
        changeEvent,
      }).some((item) => item.id === 'change-event'),
    ).toBe(false);
  });
  it('turns the typed text into an entry search', () => {
    const search = vi.fn();
    const [item] = entrySearchCommand(search)('Berger');
    expect(item!.label).toBe('Nennungen nach „Berger“ suchen');
    item!.onSelect?.();
    expect(search).toHaveBeenCalledWith('Berger');
  });
});
