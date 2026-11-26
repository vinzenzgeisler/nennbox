import { TeamHistory } from './TeamHistory.js';
import { useEffect, useState } from 'react';
import { teamRoles, type Team, type TeamRole } from '@nennbox/contracts';
import {
  AppActions,
  AppButton,
  AppNotice,
  AppSection,
  Icon,
  SelectField,
} from '@nennbox/ui';
import { TeamDialogs, type TeamDialog } from './TeamDialogs.js';
import { dialogMutation, teamDate, teamRequest } from './teamApi.js';
import './team.css';

export function TeamView() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [team, setTeam] = useState<Team | null>(null);
  const [dialog, setDialog] = useState<TeamDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState('members');
  const load = async () => {
    const next = await teamRequest();
    if (next) setTeam(next);
  };
  useEffect(() => {
    let active = true;
    void teamRequest()
      .then((next) => {
        if (active) setTeam(next);
      })
      .catch((problem: Error) => {
        if (active) setError(problem.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const mutate = async (
    path: string,
    body: unknown,
    message: string,
    method = 'POST',
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await teamRequest(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setDialog(null);
      setNotice(message);
      await load();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'Die Änderung konnte nicht gespeichert werden.',
      );
    } finally {
      setBusy(false);
    }
  };
  const open = (next: TeamDialog) => {
    setError(null);
    setDialog(next);
  };
  const submit = (input: { email: string; role: TeamRole }) => {
    if (dialog) void mutate(...dialogMutation(dialog, input));
  };
  if (!team)
    return (
      <div className="nb-app-stack">
        {error ? (
          <>
            <AppNotice tone="error">{error}</AppNotice>
            <AppButton
              onClick={() =>
                void load().catch((problem: Error) => setError(problem.message))
              }
            >
              Erneut versuchen
            </AppButton>
          </>
        ) : (
          <p role="status">Team wird geladen …</p>
        )}
      </div>
    );
  const adminCount = team.members.filter(
    (member) => member.role === 'admin' && member.status === 'active',
  ).length;
  const invitations = team.invitations.filter(
    (row) =>
      !row.revokedAt &&
      !row.redeemedAt &&
      new Date(row.expiresAt).getTime() > now,
  );
  return (
    <div className="nb-app-stack nb-team">
      <AppActions>
        <Icon name="person" />
        <h2>Team</h2>
        <AppButton tone="primary" onClick={() => open({ kind: 'invite' })}>
          Person einladen
        </AppButton>
      </AppActions>
      <p>
        Verwalte, wer im Verein mitarbeitet und welche Aufgaben die Person
        übernehmen darf.
      </p>
      {notice && <AppNotice tone="success">{notice}</AppNotice>}
      {error && !dialog && <AppNotice tone="error">{error}</AppNotice>}
      <SelectField
        label="Team-Bereich"
        value={section}
        onChange={(event) => setSection(event.target.value)}
      >
        <option value="members">Mitglieder und Einladungen</option>
        <option value="history">Verlauf</option>
      </SelectField>
      {section === 'members' ? (
        <>
          <AppSection title={`Mitglieder (${team.members.length})`}>
            <ul className="nb-team-list">
              {team.members.map((member) => {
                const name = member.displayName || member.email || 'Ohne Namen';
                const lastAdmin =
                  member.role === 'admin' &&
                  member.status === 'active' &&
                  adminCount === 1;
                return (
                  <li className="nb-team-row" key={member.id}>
                    <div>
                      <strong>{name}</strong>
                      <p>{member.email ?? 'Keine E-Mail-Adresse'}</p>
                      <p>
                        {teamRoles[member.role].label} ·{' '}
                        {member.status === 'active' ? 'Aktiv' : 'Deaktiviert'}
                      </p>
                      <small>
                        Letzte Anmeldung: {teamDate(member.lastSignedInAt)}
                      </small>
                      {lastAdmin && <p>Letzter aktiver Administrator</p>}
                    </div>
                    <AppActions>
                      {!lastAdmin && (
                        <AppButton
                          tone="secondary"
                          disabled={busy}
                          onClick={() =>
                            open({
                              kind: 'role',
                              id: member.id,
                              name,
                              role: member.role,
                            })
                          }
                        >
                          Rolle ändern
                        </AppButton>
                      )}
                      {member.status === 'disabled' ? (
                        <AppButton
                          tone="secondary"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              `/members/${member.id}`,
                              { kind: 'status', status: 'active' },
                              'Mitglied wurde reaktiviert.',
                              'PATCH',
                            )
                          }
                        >
                          Reaktivieren
                        </AppButton>
                      ) : (
                        !lastAdmin && (
                          <AppButton
                            tone="secondary"
                            disabled={busy}
                            onClick={() =>
                              open({ kind: 'disable', id: member.id, name })
                            }
                          >
                            Deaktivieren
                          </AppButton>
                        )
                      )}
                    </AppActions>
                  </li>
                );
              })}
            </ul>
          </AppSection>
          <AppSection title={`Offene Einladungen (${invitations.length})`}>
            {invitations.length ? (
              <ul className="nb-team-list">
                {invitations.map((row) => {
                  const actor = team.history.find(
                    (change) =>
                      change.targetId === row.id && change.action === 'invited',
                  );
                  return (
                    <li className="nb-team-row" key={row.id}>
                      <div>
                        <strong>{row.email}</strong>
                        <p>
                          {teamRoles[row.role].label} · Gültig bis{' '}
                          {teamDate(row.expiresAt)}
                        </p>
                        <small>
                          Eingeladen von{' '}
                          {actor?.actorName ||
                            actor?.actorSubject ||
                            'Unbekannt'}
                        </small>
                      </div>
                      <AppActions>
                        <AppButton
                          tone="secondary"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              `/invitations/${row.id}/resend`,
                              null,
                              'Einladung wurde erneut gesendet. Der vorherige Link ist ungültig.',
                            )
                          }
                        >
                          Erneut senden
                        </AppButton>
                        <AppButton
                          tone="secondary"
                          disabled={busy}
                          onClick={() =>
                            open({
                              kind: 'revoke',
                              id: row.id,
                              name: row.email,
                            })
                          }
                        >
                          Widerrufen
                        </AppButton>
                      </AppActions>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>Keine offenen Einladungen.</p>
            )}
          </AppSection>
        </>
      ) : (
        <TeamHistory team={team} />
      )}
      {dialog && (
        <TeamDialogs
          key={JSON.stringify(dialog)}
          dialog={dialog}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
