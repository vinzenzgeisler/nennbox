import { teamRoles, type Team, type TeamRole } from '@nennbox/contracts';
import { AppSection } from '@nennbox/ui';
import { teamDate } from './teamApi.js';
const actions: Record<string, string> = {
  invited: 'Einladung erstellt',
  invitation_revoked: 'Einladung widerrufen',
  invitation_resent: 'Einladung erneut gesendet',
  invitation_redeemed: 'Einladung angenommen',
  membership_changed: 'Mitgliedschaft geändert',
};
function changeText(row: Team['history'][number]) {
  const after = row.details.after as
    { role?: TeamRole; status?: string } | undefined;
  const before = row.details.before as typeof after;
  if (after && before)
    return before.role !== after.role
      ? `Rolle: ${before.role ? teamRoles[before.role]?.label : ''} → ${after.role ? teamRoles[after.role]?.label : ''}`
      : after.status === 'disabled'
        ? 'Mitglied deaktiviert'
        : 'Mitglied reaktiviert';
  return actions[row.action] ?? row.action;
}
export function TeamHistory({ team }: { team: Team }) {
  return (
    <AppSection title="Verlauf der Team-Änderungen">
      <ul className="nb-team-list">
        {[...team.history]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((row) => (
            <li className="nb-team-row" key={row.id}>
              <div>
                <strong>{changeText(row)}</strong>
                <p>
                  {team.members.find((member) => member.id === row.targetId)
                    ?.displayName ||
                    team.members.find((member) => member.id === row.targetId)
                      ?.email ||
                    team.invitations.find((item) => item.id === row.targetId)
                      ?.email ||
                    String(row.details.email ?? '')}
                </p>
                <small>
                  {row.actorName || row.actorSubject} ·{' '}
                  {teamDate(row.createdAt)}
                </small>
              </div>
            </li>
          ))}
      </ul>
      {!team.history.length && <p>Noch keine Team-Änderungen.</p>}
    </AppSection>
  );
}
