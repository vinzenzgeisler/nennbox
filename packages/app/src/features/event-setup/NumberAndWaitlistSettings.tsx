import { useEffect, useState } from 'react';
import {
  AppSection,
  AppNotice,
  AppButton,
  AppDialog,
  AppTextInput,
  AppCheckbox,
} from '@nennbox/ui';
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
  const [loaded, setLoaded] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadStartNumberSetup(eventId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setRanges(data.ranges);
        setSettings(data.settings);
        setClasses(data.classes);
        setLoaded(true);
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
    <section className="nb-app-section" aria-labelledby="number-waitlist-title">
      <header>
        <h2 id="number-waitlist-title">Startnummern & Warteliste</h2>
        <p>
          Lege Nummernbereiche und Reservierungen fest. Volle Klassen führen
          automatisch eine Warteliste.
        </p>
      </header>
      {message && (
        <AppNotice tone={failed ? 'error' : 'success'}>{message}</AppNotice>
      )}
      {!loaded ? (
        !failed && <p role="status">Einstellungen werden geladen …</p>
      ) : (
        <>
          <ClassCapacities classes={classes} onChange={setClasses} />
          <StartNumberRanges
            ranges={ranges}
            classes={classes}
            onChange={setRanges}
          />
          <AppSection title="Warteliste">
            <AppCheckbox
              label="Bei freiem Platz automatisch nachrücken lassen"
              checked={settings.automaticPromotion}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  automaticPromotion: event.target.checked,
                }))
              }
            />
            <AppTextInput
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
              Standard: 48 Stunden. Manuelles Nachrücken bleibt jederzeit
              möglich.
            </p>
          </AppSection>
          <footer className="nb-app-inline">
            <AppButton
              tone="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              Speichern
            </AppButton>
            <AppButton
              tone="secondary"
              disabled={busy}
              onClick={() => void planAssign()}
            >
              Alle offenen Nummern vergeben
            </AppButton>
          </footer>
        </>
      )}
      <AppDialog
        open={pendingAssign !== null}
        title="Startnummern vergeben?"
        closeLabel="AppDialog schließen"
        onClose={() => setPendingAssign(null)}
        actions={
          <>
            <AppButton tone="secondary" onClick={() => setPendingAssign(null)}>
              Abbrechen
            </AppButton>
            <AppButton onClick={() => void confirmAssign()}>
              {pendingAssign} Startnummern vergeben
            </AppButton>
          </>
        }
      >
        <p>
          {pendingAssign} offene Startnummern werden automatisch aus den
          gespeicherten Nummernbereichen vergeben. Speichere geänderte Bereiche
          vorher.
        </p>
      </AppDialog>
    </section>
  );
}
