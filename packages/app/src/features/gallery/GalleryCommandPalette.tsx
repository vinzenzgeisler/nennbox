import { useState } from 'react';
import { AdminNavigation, CommandPalette, Signet } from '@nennbox/ui';
import { APP_NAVIGATION_REGISTRY } from '../shell/AppShell.js';
import { entrySearchCommand, shellCommands } from '../shell/shellCommands.js';

const events = [
  { id: 'road', name: 'Straßenrennen 2027' },
  { id: 'hill', name: 'Historischer Bergpreis 2027' },
];

/** Seitenleiste mit Suchfeld und „Suchen und springen“ mit den echten Befehlen der App. */
export function GalleryCommandPalette() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('entries');
  const [event, setEvent] = useState('road');
  const [last, setLast] = useState('');
  const navigation = APP_NAVIGATION_REGISTRY.flatMap((group) => group.items);
  return (
    <section>
      <h2>App-Design · Seitenleiste und Suchen und springen</h2>
      <div className="nb-gallery-command-sidebar">
        <AdminNavigation
          brand={
            <span className="nb-app-brand">
              <span className="nb-app-brand-icon">
                <Signet />
              </span>
              <strong>NENNBOX</strong>
            </span>
          }
          ariaLabel="Galerie-Navigation"
          eventInHeader
          eventLabel="Veranstaltung"
          eventPlaceholder="Veranstaltung wählen"
          events={events.map((item) => ({ id: item.id, label: item.name }))}
          selectedEvent={event}
          onEventChange={setEvent}
          groups={APP_NAVIGATION_REGISTRY.map((group) => ({
            label: group.label,
            items: group.items.map((item) =>
              item.id === 'entries' ? { ...item, count: 62 } : item,
            ),
          }))}
          current={current}
          onNavigate={setCurrent}
          onSearch={() => setOpen(true)}
          user={
            <span className="nb-user-identity">
              <b aria-hidden="true">AB</b>
              <span>
                <strong>A. Beispiel</strong>
                <small>MSC Beispielstadt e. V.</small>
              </span>
            </span>
          }
        />
      </div>
      <p aria-live="polite">{last && `Ausgeführt: ${last}`}</p>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        items={shellCommands({
          navigation,
          events,
          activeEvent: event,
          navigate: (id) => {
            setCurrent(id);
            setLast(id);
          },
          changeEvent: (id) => {
            setEvent(id);
            setLast(id);
          },
        })}
        queryItems={entrySearchCommand((query) => setLast(`Suche ${query}`))}
      />
    </section>
  );
}
