import { useEffect, useState } from 'react';
import { Button } from '@nennbox/ui';
import {
  getAdminIdentity,
  restoreInvitationSession,
  redeemInvitation,
  signIn,
  signOut,
} from '../../auth.js';
import {
  clearInvitation,
  markInvitationLogin,
  readInvitationToken,
} from './invitation-session.js';

/** Temporary acceptance flow, intentionally outside the administration shell. */
export function InvitationAcceptance() {
  const [token] = useState(readInvitationToken);
  const [session, setSession] = useState<
    'loading' | 'ready' | 'signed-out' | 'disabled' | 'error'
  >('loading');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    void restoreInvitationSession()
      .then((result) => {
        if (active) setSession(result);
      })
      .catch(() => {
        if (active) setSession('error');
      });
    return () => {
      active = false;
    };
  }, [token]);
  async function accept() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await redeemInvitation(token);
      clearInvitation();
      setAccepted(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Die Einladung konnte nicht angenommen werden.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell">
      <p className="eyebrow">NENNBOX · Vorläufige Einladungsseite</p>
      <h1>Teameinladung annehmen</h1>
      <p>
        Diese vorläufige Seite liegt außerhalb der Verwaltungsoberfläche. Erst
        mit „Einladung annehmen“ treten Sie dem Team bei.
      </p>
      {!token ? (
        <p role="alert">
          Der Einladungslink ist unvollständig oder ungültig. Bitte den
          vollständigen Link aus der E-Mail öffnen.
        </p>
      ) : accepted ? (
        <>
          <p role="status">Die Einladung wurde angenommen.</p>
          <a href="/app">Zur Anwendung</a>
        </>
      ) : (
        <>
          {session === 'loading' && (
            <p role="status">Anmeldung wird geprüft…</p>
          )}
          {session === 'signed-out' && (
            <>
              <p>
                Bitte mit der eingeladenen E-Mail-Adresse anmelden. Die
                E-Mail-Adresse muss bestätigt sein.
              </p>
              <Button
                onClick={() => {
                  markInvitationLogin();
                  void signIn().catch(() => setSession('error'));
                }}
              >
                Anmelden
              </Button>
            </>
          )}
          {session === 'ready' && (
            <>
              <p>
                Angemeldet als {getAdminIdentity()?.name ?? 'Teammitglied'}.
                Bitte bestätigen Sie die Annahme der Einladung.
              </p>
              <Button disabled={busy} onClick={() => void accept()}>
                {busy ? 'Einladung wird angenommen…' : 'Einladung annehmen'}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  clearInvitation();
                  void signOut().catch(() => setSession('error'));
                }}
              >
                Abmelden
              </Button>
            </>
          )}
          {(session === 'error' || session === 'disabled') && (
            <p role="alert">
              Die Anmeldung ist derzeit nicht verfügbar. Bitte die Seite später
              erneut öffnen.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </main>
  );
}
