import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Dialog, Field, Wordmark } from '@nennbox/ui';
import { DriverPortalReady } from './DriverPortalReady.js';
import { passengerBrandStyle } from '../passenger/passengerBrand.js';
import './driver-portal.css';

import {
  json,
  portalUrl,
  useDriverPortalAccess,
} from './useDriverPortalAccess.js';

export function DriverPortal({ eventSlug }: { eventSlug: string }) {
  const [email, setEmail] = useState('');
  const { phase, setPhase, view, setView, refresh, retry } =
    useDriverPortalAccess();
  const [notice, setNotice] = useState(() => {
    const result = new URLSearchParams(location.search).get('payment');
    if (result === 'success')
      return 'Danke! Der Zahlungsstand wird aktualisiert, sobald die Zahlung bestätigt ist.';
    return result === 'cancelled'
      ? 'Die Zahlung wurde nicht abgeschlossen. Du kannst es jederzeit erneut versuchen.'
      : '';
  });
  const [working, setWorking] = useState(false);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('payment')) return;
    params.delete('payment');
    const search = params.toString();
    history.replaceState(
      history.state,
      '',
      location.pathname + (search ? `?${search}` : '') + location.hash,
    );
  }, []);
  const pay = async () => {
    setWorking(true);
    setNotice('');
    try {
      const { url } = (await json(
        `${portalUrl}/payment/checkout`,
        'POST',
        {},
      )) as {
        url: string;
      };
      window.location.assign(url);
    } catch {
      setNotice('Die Online-Zahlung konnte nicht gestartet werden.');
      setWorking(false);
    }
  };
  const request = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      await json(`${portalUrl}/request`, 'POST', {
        eventSlug,
        email,
        locale: 'de',
      });
      setPhase('sent');
    } catch {
      setNotice('Das hat nicht geklappt. Bitte versuche es später erneut.');
    } finally {
      setWorking(false);
    }
  };
  const upload = async (entryId: string, typeKey: string, file: File) => {
    setWorking(true);
    setNotice('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('typeKey', typeKey);
      const response = await fetch(
        `${portalUrl}/entries/${entryId}/documents`,
        { method: 'POST', credentials: 'same-origin', body: form },
      );
      if (!response.ok) throw new Error();
      await refresh();
      setNotice(
        'Unterlage hochgeladen. Der Veranstalter kann sie jetzt prüfen.',
      );
    } catch {
      setNotice(
        'Die Unterlage konnte nicht hochgeladen werden. Bitte PDF, JPG oder PNG bis 10 MB wählen.',
      );
    } finally {
      setWorking(false);
    }
  };
  const save = async (entryId: string, fields: Record<string, string>) => {
    setWorking(true);
    setNotice('');
    try {
      await json(`${portalUrl}/entries/${entryId}`, 'PATCH', { fields });
      await refresh();
      setNotice('Deine Angaben wurden gespeichert.');
      return true;
    } catch {
      setNotice('Deine Angaben konnten nicht gespeichert werden.');
      return false;
    } finally {
      setWorking(false);
    }
  };
  const withdraw = async () => {
    if (!withdrawId) return;
    setWorking(true);
    try {
      await json(`${portalUrl}/entries/${withdrawId}/withdraw`, 'POST', {
        confirmed: true,
      });
      try {
        await refresh();
      } catch {
        setView(null);
        setPhase('error');
      }
      setNotice('Die Nennung wurde zurückgezogen.');
    } catch {
      setNotice('Die Nennung konnte nicht zurückgezogen werden.');
    } finally {
      setWorking(false);
      setWithdrawId(null);
    }
  };
  return (
    <div className="driver-portal" style={passengerBrandStyle}>
      <div className="driver-portal-hero">
        <header className="driver-portal-header">
          <Wordmark variant="on-green" />
          <span>MEINE NENNUNG</span>
        </header>
        <div className="driver-portal-intro">
          <p className="driver-portal-eyebrow">DEINE VERANSTALTUNG</p>
          {view && (
            <p className="driver-portal-date">
              {new Intl.DateTimeFormat('de-DE', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${view.startsOn}T00:00:00.000Z`))}
            </p>
          )}
          <h1>{view?.eventName ?? 'Meine Nennung'}</h1>
          <p>Alles Wichtige zu deiner Teilnahme an einem Ort.</p>
        </div>
      </div>
      <div className="driver-portal-content">
        {notice && (
          <Banner
            tone={
              notice.includes('konnte') ||
              notice.includes('nicht geklappt') ||
              notice.includes('nicht abgeschlossen')
                ? 'error'
                : 'success'
            }
          >
            {notice}
          </Banner>
        )}
        {phase === 'loading' && (
          <p role="status">Deine Nennung wird geladen …</p>
        )}
        {phase === 'error' && (
          <Banner tone="error" title="Technischer Fehler">
            Deine Nennung konnte nicht geladen werden. Bitte versuche es erneut.
            <Button variant="text" onClick={() => void retry()}>
              Erneut laden
            </Button>
          </Banner>
        )}
        {phase === 'invalid' && (
          <Banner tone="warning" title="Link nicht mehr gültig">
            Fordere bitte einen neuen Link an.
            <Button variant="text" onClick={() => setPhase('request')}>
              Neuen Link anfordern
            </Button>
          </Banner>
        )}
        {phase === 'sent' && (
          <Banner tone="success" title="Bitte prüfe dein Postfach">
            Falls zu dieser Adresse eine verifizierte Nennung vorliegt, erhältst
            du jetzt einen Link. Er gilt 30 Minuten und kann einmal verwendet
            werden.
          </Banner>
        )}
        {phase === 'request' && (
          <section className="driver-portal-panel">
            <h2>Persönlichen Link anfordern</h2>
            <p>
              Gib die E-Mail-Adresse ein, mit der deine Nennung bestätigt wurde.
              Wir senden dir einen sicheren Link.
            </p>
            <form onSubmit={(event) => void request(event)}>
              <Field
                label="E-Mail-Adresse"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" disabled={working}>
                Link per E-Mail erhalten
              </Button>
            </form>
          </section>
        )}
        {phase === 'ready' && view && (
          <DriverPortalReady
            view={view}
            working={working}
            upload={upload}
            save={save}
            pay={pay}
            setWithdrawId={setWithdrawId}
            onLogout={() => {
              void json(`${portalUrl}/logout`, 'POST').finally(() => {
                setView(null);
                setPhase('request');
              });
            }}
          />
        )}
      </div>
      <Dialog
        open={!!withdrawId}
        title="Nennung wirklich zurückziehen?"
        closeLabel="Schließen"
        onClose={() => setWithdrawId(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setWithdrawId(null)}>
              Behalten
            </Button>
            <Button
              variant="primary"
              disabled={working}
              onClick={() => void withdraw()}
            >
              Ja, zurückziehen
            </Button>
          </>
        }
      >
        <p>
          Diese Nennung wird als zurückgezogen markiert. Das lässt sich hier
          nicht rückgängig machen.
        </p>
      </Dialog>
    </div>
  );
}
