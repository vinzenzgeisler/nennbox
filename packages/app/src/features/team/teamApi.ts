import { TeamResponse } from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';
import type { TeamRole } from '@nennbox/contracts';
import type { TeamDialog } from './TeamDialogs.js';

export async function teamRequest(path = '', init: RequestInit = {}) {
  const response = await adminFetch(`/admin/team${path}`, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    const translations: Record<string, string> = {
      'Invalid email address.': 'Bitte gib eine gültige E-Mail-Adresse ein.',
      'Unicode in the email local part is not supported. Use an ASCII local part.':
        'Vor dem @ sind nur ASCII-Zeichen erlaubt. Bitte verwende eine andere E-Mail-Adresse.',
    };
    const message = data.error
      ? (translations[data.error] ?? data.error)
      : undefined;
    if (
      message &&
      message !== 'Team request failed' &&
      message !== 'Invalid request'
    )
      throw new Error(message);
    throw new Error(
      response.status === 409
        ? 'Die Änderung ist nicht mehr möglich. Bitte lade das Team neu; mindestens ein aktiver Administrator muss bleiben.'
        : response.status === 403
          ? 'Du darfst das Team nicht verwalten. Bitte melde dich erneut an.'
          : response.status === 400
            ? 'Bitte prüfe E-Mail-Adresse und Rolle.'
            : 'Das Team konnte nicht geladen oder geändert werden. Bitte versuche es erneut.',
    );
  }
  return init.method ? null : TeamResponse.parse(await response.json());
}
export const teamDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Noch keine Anmeldung';

/** Request and confirmation text for the action a team dialog confirms. */
export function dialogMutation(
  dialog: TeamDialog,
  { email, role }: { email: string; role: TeamRole },
): [path: string, body: unknown, message: string, method?: string] {
  if (dialog.kind === 'invite')
    return ['/invitations', { email, role }, 'Einladung wurde gesendet.'];
  if (dialog.kind === 'role')
    return [
      `/members/${dialog.id}`,
      { kind: 'role', role },
      'Rolle wurde geändert.',
      'PATCH',
    ];
  if (dialog.kind === 'disable')
    return [
      `/members/${dialog.id}`,
      { kind: 'status', status: 'disabled' },
      'Mitglied wurde deaktiviert.',
      'PATCH',
    ];
  return [
    `/invitations/${dialog.id}/revoke`,
    null,
    'Einladung wurde widerrufen.',
  ];
}
