import { useEffect, useState } from 'react';
import { Banner, Button, Dialog, Field, Switch } from '@racepilot/ui';
import { ClassCapacities } from './ClassCapacities.js';
import { StartNumberRanges } from './StartNumberRanges.js';
import {
  assignOpenNumbers,
  loadStartNumberSetup,
  saveStartNumberSetup,
  type ClassOption,
  type Range,
  type Settings,
} from './startNumberApi.js';
import './NumberAndWaitlistSettings.css';

export function NumberAndWaitlistSettings({ eventId }: { eventId: string }) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [settings, setSettings] = useState<Settings>({
    automaticPromotion: false,
    confirmationHours: 48,
  });
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadStartNumberSetup(eventId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setRanges(loaded.ranges);
        setSettings(loaded.settings);
        setClasses(loaded.classes);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setMessage('Einstellungen konnten nicht geladen werden.');
      });
    return () => controller.abort();
  }, [eventId]);

  const run = async (task: () => Promise<string>, error: string) => {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      setMessage(await task());
    } catch {
      setFailed(true);
      setMessage(error);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      await saveStartNumberSetup(eventId, ranges, settings, classes);
      return 'Einstellungen gespeichert.';
    }, 'Einstellungen konnten nicht gespeichert werden.');
  const planAssign = () =>
    run(async () => {
      const open = await assignOpenNumbers(eventId, true);
      setPendingAssign(open > 0 ? open : null);
      return open > 0 ? '' : 'Es gibt keine offenen Nummern zu vergeben.';
    }, 'Startnummern konnten nicht geprüft werden.');
  const confirmAssign = () => {
    setPendingAssign(null);
    return run(
      async () =>
        `${await assignOpenNumbers(eventId, false)} Startnummern vergeben.`,
      'Startnummern konnten nicht vergeben werden.',
    );
  };

  return (
    <section
      className="nb-number-waitlist-settings"
      aria-labelledby="number-waitlist-title"
    >
      <header>
        <h2 id="number-waitlist-title">Startnummern & Warteliste</h2>
        <p>
          Lege Nummernbereiche und Reservierungen fest. Volle Klassen führen
          automatisch eine Warteliste.
        </p>
      </header>
      {message && <Banner tone={failed ? 'error' : 'info'}>{message}</Banner>}
      <ClassCapacities classes={classes} onChange={setClasses} />
      <StartNumberRanges
        ranges={ranges}
        classes={classes}
        onChange={setRanges}
      />
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
        <Button disabled={busy} onClick={() => void save()}>
          Speichern
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void planAssign()}
        >
          Alle offenen Nummern vergeben
        </Button>
      </footer>
      <Dialog
        open={pendingAssign !== null}
        title="Startnummern vergeben?"
        closeLabel="Dialog schließen"
        onClose={() => setPendingAssign(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPendingAssign(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => void confirmAssign()}>
              {pendingAssign} Startnummern vergeben
            </Button>
          </>
        }
      >
        <p>
          {pendingAssign} offene Startnummern werden automatisch aus den
          gespeicherten Nummernbereichen vergeben. Speichere geänderte Bereiche
          vorher.
        </p>
      </Dialog>
    </section>
  );
}
