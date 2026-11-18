import { useEffect, useState } from 'react';
import { Banner, Button, Field, SelectField, Switch } from '@racepilot/ui';
import { ClassCapacities, type ClassOption } from './ClassCapacities.js';
import { adminFetch } from '../../auth.js';
import './NumberAndWaitlistSettings.css';

type Mode = 'driver_choice' | 'organizer_assigned' | 'automatic';
type Range = {
  id?: string;
  classId: string | null;
  from: string;
  to: string;
  reserved: string;
  mode: Mode;
};
type Settings = { automaticPromotion: boolean; confirmationHours: number };
type Config = {
  ranges: Array<{
    id: string;
    classId: string | null;
    from: number;
    to: number;
    reserved: number[];
    mode: Mode;
  }>;
  settings: Settings;
};
const emptyRange = (): Range => ({
  classId: null,
  from: '1',
  to: '50',
  reserved: '',
  mode: 'driver_choice',
});

export function NumberAndWaitlistSettings({ eventId }: { eventId: string }) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [settings, setSettings] = useState<Settings>({
    automaticPromotion: false,
    confirmationHours: 48,
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const eventUrl = `/admin/events/${encodeURIComponent(eventId)}`;
    Promise.all([
      adminFetch(`${eventUrl}/start-numbers`, {
        signal: controller.signal,
      }).then(async (response) =>
        response.ok ? (response.json() as Promise<Config>) : Promise.reject(),
      ),
      adminFetch(`${eventUrl}/classes`, { signal: controller.signal }).then(
        async (response) =>
          response.ok
            ? (response.json() as Promise<ClassOption[]>)
            : Promise.reject(),
      ),
    ])
      .then(([config, eventClasses]) => {
        if (controller.signal.aborted) return;
        setRanges(
          config.ranges.map((range) => ({
            ...range,
            from: String(range.from),
            to: String(range.to),
            reserved: range.reserved.join(', '),
          })),
        );
        setSettings(config.settings);
        setClasses(eventClasses);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage('Einstellungen konnten nicht geladen werden.');
      });
    return () => controller.abort();
  }, [eventId]);

  const changeRange = (index: number, patch: Partial<Range>) =>
    setRanges((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await adminFetch(
        `/admin/events/${encodeURIComponent(eventId)}/start-numbers`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ranges: ranges.map(({ classId, from, to, reserved, mode }) => ({
              classId,
              from: Number(from),
              to: Number(to),
              reserved: reserved
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
                .map(Number),
              mode,
            })),
            settings,
          }),
        },
      );
      if (!response.ok) throw new Error();
      const capacityResponses = await Promise.all(
        classes.map((eventClass) =>
          adminFetch(
            `/admin/events/${encodeURIComponent(eventId)}/classes/${encodeURIComponent(eventClass.id)}`,
            {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                maxParticipants: eventClass.maxParticipants,
              }),
            },
          ),
        ),
      );
      if (capacityResponses.some((capacityResponse) => !capacityResponse.ok))
        throw new Error();
      setMessage('Einstellungen gespeichert.');
    } catch {
      setMessage('Einstellungen konnten nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };
  const assignAll = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await adminFetch(
        `/admin/events/${encodeURIComponent(eventId)}/start-numbers/assign-all`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { assigned: unknown[] };
      setMessage(`${result.assigned.length} Startnummern vergeben.`);
    } catch {
      setMessage('Startnummern konnten nicht vergeben werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="nb-number-waitlist-settings"
      aria-labelledby="number-waitlist-title"
    >
      <header>
        <div>
          <p className="nb-number-waitlist-eyebrow">Einrichten</p>
          <h2 id="number-waitlist-title">Startnummern & Warteliste</h2>
          <p>
            Lege Nummernbereiche und Reservierungen fest. Volle Klassen führen
            automatisch eine Warteliste.
          </p>
        </div>
      </header>
      {message && (
        <Banner tone={message.includes('nicht') ? 'error' : 'info'}>
          {message}
        </Banner>
      )}
      <ClassCapacities classes={classes} onChange={setClasses} />
      <div className="nb-number-range-list">
        {ranges.map((range, index) => (
          <div className="nb-number-range" key={range.id ?? index}>
            <SelectField
              label="Gilt für"
              value={range.classId ?? ''}
              onChange={(event) =>
                changeRange(index, { classId: event.target.value || null })
              }
            >
              <option value="">Alle Klassen</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
            <Field
              label="Von"
              type="number"
              min="0"
              value={range.from}
              onChange={(event) =>
                changeRange(index, { from: event.target.value })
              }
            />
            <Field
              label="Bis"
              type="number"
              min="0"
              value={range.to}
              onChange={(event) =>
                changeRange(index, { to: event.target.value })
              }
            />
            <Field
              label="Reserviert (Komma-getrennt)"
              value={range.reserved}
              onChange={(event) =>
                changeRange(index, { reserved: event.target.value })
              }
            />
            <SelectField
              label="Vergabe"
              value={range.mode}
              onChange={(event) =>
                changeRange(index, { mode: event.target.value as Mode })
              }
            >
              <option value="driver_choice">Fahrerwunsch</option>
              <option value="organizer_assigned">Veranstalter vergibt</option>
              <option value="automatic">Automatisch nächste freie</option>
            </SelectField>
            <Button
              variant="text"
              className="nb-number-range-remove"
              aria-label="Bereich entfernen"
              onClick={() =>
                setRanges((items) => items.filter((_, i) => i !== index))
              }
            >
              Entfernen
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="text"
        className="nb-number-range-add"
        onClick={() => setRanges((items) => [...items, emptyRange()])}
      >
        + Nummernbereich hinzufügen
      </Button>
      <section
        className="nb-waitlist-settings"
        aria-labelledby="waitlist-settings-title"
      >
        <h3 id="waitlist-settings-title">Warteliste</h3>
        <Switch
          className="nb-waitlist-toggle"
          label="Bei freiem Platz automatisch nachrücken lassen"
          checked={settings.automaticPromotion}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              automaticPromotion: event.target.checked,
            }))
          }
        />
        <Field
          label="Bestätigungsfrist (Stunden)"
          type="number"
          min="1"
          max="720"
          value={settings.confirmationHours}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              confirmationHours: Number(event.target.value),
            }))
          }
        />
        <p>
          Standard: 48 Stunden. Manuelles Nachrücken bleibt jederzeit möglich.
        </p>
      </section>
      <footer>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void assignAll()}
        >
          Alle offenen Nummern automatisch vergeben
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          Einstellungen speichern
        </Button>
      </footer>
    </section>
  );
}
