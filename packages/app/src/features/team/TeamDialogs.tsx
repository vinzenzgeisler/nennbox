import { useState } from 'react';
import { teamRoles, type TeamRole } from '@nennbox/contracts';
import {
  AppButton,
  AppDialog,
  AppNotice,
  SelectField,
  TextInput,
} from '@nennbox/ui';
export type TeamDialog =
  | { kind: 'invite' }
  | { kind: 'role'; id: string; name: string; role: TeamRole }
  | { kind: 'disable' | 'revoke'; id: string; name: string };
export function TeamDialogs({
  dialog,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  dialog: TeamDialog;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { email: string; role: TeamRole }) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>(
    dialog.kind === 'role' ? dialog.role : 'viewer',
  );
  const title =
    dialog.kind === 'invite'
      ? 'Person einladen'
      : dialog.kind === 'role'
        ? 'Rolle ändern'
        : dialog.kind === 'disable'
          ? 'Mitglied deaktivieren'
          : 'Einladung widerrufen';
  const submit =
    dialog.kind === 'invite'
      ? 'Einladung senden'
      : dialog.kind === 'role'
        ? 'Rolle speichern'
        : dialog.kind === 'disable'
          ? 'Deaktivieren'
          : 'Widerrufen';
  return (
    <AppDialog
      open
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      closeLabel="Schließen"
      actions={
        <>
          <AppButton tone="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </AppButton>
          <AppButton
            tone="primary"
            type="submit"
            form="team-dialog-form"
            disabled={busy}
          >
            {busy ? 'Wird gespeichert …' : submit}
          </AppButton>
        </>
      }
    >
      <form
        id="team-dialog-form"
        className="nb-app-stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ email, role });
        }}
      >
        {dialog.kind === 'invite' && (
          <TextInput
            label="E-Mail-Adresse"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
        {dialog.kind === 'role' && <p>{dialog.name}</p>}
        {(dialog.kind === 'invite' || dialog.kind === 'role') && (
          <>
            <SelectField
              label="Rolle"
              value={role}
              disabled={busy}
              onChange={(event) => setRole(event.target.value as TeamRole)}
            >
              {Object.entries(teamRoles).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </SelectField>
            <div className="nb-app-stack" aria-label="Rechte der Rollen">
              {Object.entries(teamRoles).map(([key, value]) => (
                <p key={key}>
                  <strong>{value.label}</strong> — {value.description}
                </p>
              ))}
            </div>
          </>
        )}
        {dialog.kind === 'disable' && (
          <p>
            {dialog.name} verliert sofort den Zugriff. Die Person bleibt im
            Verlauf erhalten und kann später reaktiviert werden.
          </p>
        )}
        {dialog.kind === 'revoke' && (
          <p>
            Die Einladung an {dialog.name} wird ungültig. Der bisherige Link
            kann danach nicht mehr verwendet werden.
          </p>
        )}
        {error && <AppNotice tone="error">{error}</AppNotice>}
      </form>
    </AppDialog>
  );
}
