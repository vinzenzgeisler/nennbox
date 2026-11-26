import { TeamHistory } from './TeamHistory.js';
import { useEffect, useState } from 'react';
import { teamRoles, type Team, type TeamRole } from '@nennbox/contracts';
import {
  AppButton,
  AppChip,
  AppNotice,
  AppSection,
  AppStatusPill,
  Menu,
  MenuItem,
  TabList,
  TabPanel,
} from '@nennbox/ui';
import { TeamDialogs, type TeamDialog } from './TeamDialogs.js';
import {
  dialogMutation,
  teamDate,
  teamLastSignIn,
  teamRequest,
} from './teamApi.js';
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
  const [section, setSection] = useState('team-members');
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
      <header className="nb-team-head">
        <div>
          <h2>Team</h2>
          <p>
            Verwalte, wer im Verein mitarbeitet und welche Aufgaben die Person
            übernehmen darf.
          </p>
        </div>
        <AppButton tone="primary" onClick={() => open({ kind: 'invite' })}>
          Person einladen
        </AppButton>
      </header>
      {notice && <AppNotice tone="success">{notice}</AppNotice>}
      {error && !dialog && <AppNotice tone="error">{error}</AppNotice>}
      <TabList
        label="Team"
        selected={section}
        onChange={setSection}
        tabs={[
          { id: 'team-members', label: 'Mitglieder' },
          { id: 'team-history', label: 'Verlauf' },
        ]}
      />
      <TabPanel id={section}>
        {section === 'team-members' ? (
          <div className="nb-app-stack">
            <AppSection title={`Mitglieder (${team.members.length})`}>
              <ul className="nb-team-list">
                {team.members.map((member) => {
                  const name =
                    member.displayName || member.email || 'Ohne Namen';
                  const lastAdmin =
                    member.role === 'admin' &&
                    member.status === 'active' &&
                    adminCount === 1;
                  return (
                    <li className="nb-team-row" key={member.id}>
                      <div className="nb-team-person">
                        <strong>{name}</strong>
                        <span>{member.email ?? 'Keine E-Mail-Adresse'}</span>
                      </div>
                      <div className="nb-team-meta">
                        <AppChip>{teamRoles[member.role].label}</AppChip>
                        <AppStatusPill
                          status={member.status === 'active' ? 'zu' : 'ab'}
                        >
                          {member.status === 'active' ? 'Aktiv' : 'Deaktiviert'}
                        </AppStatusPill>
                        <small>
                          {member.lastSignedInAt
                            ? `Zuletzt angemeldet: ${teamLastSignIn(member.lastSignedInAt, now)}`
                            : teamLastSignIn(null)}
                        </small>
                      </div>
                      {lastAdmin ? (
                        <small className="nb-team-note">
                          Letzter aktiver Administrator
                        </small>
                      ) : (
                        <Menu label={`Aktionen für ${name}`}>
                          <MenuItem
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
                          </MenuItem>
                          {member.status === 'disabled' ? (
                            <MenuItem
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
                            </MenuItem>
                          ) : (
                            <MenuItem
                              tone="danger"
                              disabled={busy}
                              onClick={() =>
                                open({ kind: 'disable', id: member.id, name })
                              }
                            >
                              Deaktivieren
                            </MenuItem>
                          )}
                        </Menu>
                      )}
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
                        change.targetId === row.id &&
                        change.action === 'invited',
                    );
                    return (
                      <li className="nb-team-row" key={row.id}>
                        <div className="nb-team-person">
                          <strong>{row.email}</strong>
                          <span>
                            Eingeladen von{' '}
                            {actor?.actorName ||
                              actor?.actorSubject ||
                              'Unbekannt'}
                          </span>
                        </div>
                        <div className="nb-team-meta">
                          <AppChip>{teamRoles[row.role].label}</AppChip>
                          <AppStatusPill status="vor">Eingeladen</AppStatusPill>
                          <small>Gültig bis {teamDate(row.expiresAt)}</small>
                        </div>
                        <Menu label={`Aktionen für ${row.email}`}>
                          <MenuItem
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
                          </MenuItem>
                          <MenuItem
                            tone="danger"
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
                          </MenuItem>
                        </Menu>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>Keine offenen Einladungen.</p>
              )}
            </AppSection>
          </div>
        ) : (
          <TeamHistory team={team} />
        )}
      </TabPanel>
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
