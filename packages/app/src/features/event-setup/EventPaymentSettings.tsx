import { useState } from 'react';
import { AppActions, AppButton, AppNotice } from '@nennbox/ui';
import { RegistrationFormConfigPatchSchema } from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';
import { RegistrationPaymentSettings } from '../registration/RegistrationPaymentSettings.js';
import {
  changedOverrides,
  useRegistrationConfig,
} from '../registration/useRegistrationConfig.js';

type Notice = { text: string; tone: 'success' | 'error' };

/**
 * Payment methods and refund rule of one event, in the event setup next to the
 * organizer and bank details. Saves the event's own override; what the event does
 * not override stays with the organization default.
 */
export function EventPaymentSettings({ eventId }: { eventId: string }) {
  const { config, overrides, setOverrides, loaded, error } =
    useRegistrationConfig(eventId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  if (error)
    return (
      <AppNotice tone="error">
        {error} Die Zahlungseinstellungen lassen sich so nicht ändern. Bitte
        öffne die Ansicht erneut.
      </AppNotice>
    );
  if (!loaded)
    return <p role="status">Zahlungseinstellungen werden geladen …</p>;
  const save = async () => {
    if (busy) return;
    if (problem) {
      setShowProblems(true);
      setNotice({ text: problem, tone: 'error' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const path = `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`;
      // This editor stays mounted while Formularfelder saves the same resource.
      // Preserve its latest fields instead of writing the original loaded copy.
      const latest = await adminFetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!latest.ok && latest.status !== 404) throw new Error();
      const patch =
        latest.status === 404
          ? {}
          : RegistrationFormConfigPatchSchema.parse(
              (await latest.json()).config,
            );
      if (overrides.payments === undefined) delete patch.payments;
      else patch.payments = overrides.payments;
      const response = await adminFetch(path, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error();
      setNotice({
        text: 'Zahlungseinstellungen gespeichert.',
        tone: 'success',
      });
    } catch {
      setNotice({
        text: 'Zahlungseinstellungen konnten nicht gespeichert werden.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="nb-app-stack nb-event-payment-settings">
      <RegistrationPaymentSettings
        key={resetCount}
        config={config}
        updateConfig={(updater) =>
          setOverrides((current) =>
            changedOverrides(current, config, updater(config)),
          )
        }
        onRefundProblem={setProblem}
        showProblems={showProblems}
      />
      <AppActions>
        <AppButton
          type="button"
          tone="secondary"
          disabled={busy || overrides.payments === undefined}
          onClick={() => {
            setOverrides((current) => {
              const next = { ...current };
              delete next.payments;
              return next;
            });
            setResetCount((value) => value + 1);
            setNotice(null);
          }}
        >
          Zahlungsarten und Erstattungsregel von Organisation übernehmen
        </AppButton>
        <AppButton
          type="button"
          tone="secondary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Wird gespeichert …' : 'Zahlungseinstellungen speichern'}
        </AppButton>
        {notice && <AppNotice tone={notice.tone}>{notice.text}</AppNotice>}
      </AppActions>
    </div>
  );
}
