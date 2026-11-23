import { useEffect, useState } from 'react';
import { AppNotice, AppButton, AppCheckbox, AppSection } from '@nennbox/ui';
import { z } from 'zod';
import { apiRequest } from '../remote/apiRequest.js';

const options = [
  { key: 'phone', label: 'Telefon' },
  { key: 'street', label: 'Straße' },
  { key: 'postalCode', label: 'Postleitzahl' },
  { key: 'city', label: 'Ort' },
  { key: 'emergencyContactName', label: 'Notfallkontakt' },
  { key: 'emergencyContactPhone', label: 'Telefon Notfallkontakt' },
  { key: 'licenseNumber', label: 'Lizenznummer' },
] as const;
const fieldsSchema = z.object({
  fields: z.array(z.enum(options.map((option) => option.key))),
});

/** Organizer-controlled correction scope; no field is editable until explicitly enabled. */
export function DriverPortalSettings(props: { eventId: string; slug: string }) {
  // Remount per event so a failed or slow load can never leak the previous event's state.
  return <DriverPortalSettingsForEvent key={props.eventId} {...props} />;
}

function DriverPortalSettingsForEvent({
  eventId,
  slug,
}: {
  eventId: string;
  slug: string;
}) {
  const [fields, setFields] = useState<string[]>([]);
  const [state, setState] = useState<
    'loading' | 'ready' | 'saving' | 'load-error' | 'save-error' | 'saved'
  >('loading');
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null);
  const canEdit =
    loadedEventId === eventId && state !== 'loading' && state !== 'saving';
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest(
      `/admin/events/${eventId}/driver-portal-fields`,
      fieldsSchema,
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        setLoadedEventId(eventId);
        setFields(value.fields);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('load-error');
      });
    return () => controller.abort();
  }, [eventId]);
  const save = async () => {
    if (!canEdit) return;
    setState('saving');
    try {
      await apiRequest(
        `/admin/events/${eventId}/driver-portal-fields`,
        fieldsSchema,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fields }),
        },
      );
      setState('saved');
    } catch {
      setState('save-error');
    }
  };
  return (
    <section
      className="nb-app-section"
      aria-labelledby="driver-portal-settings-title"
    >
      <h2 id="driver-portal-settings-title">Fahrer-Portal</h2>
      <p>
        Verifizierte Teilnehmer können ihren Status und ihre Unterlagen
        einsehen. Änderungen sind nur für die hier freigegebenen Felder möglich.
      </p>
      <p>
        Teilnehmer-Link:{' '}
        <a
          href={`/events/${encodeURIComponent(slug)}/my-entry`}
          target="_blank"
          rel="noreferrer"
        >
          Meine Nennung öffnen
        </a>
      </p>
      {(state === 'load-error' || state === 'save-error') && (
        <AppNotice tone="error">
          {state === 'load-error'
            ? 'Die Einstellungen konnten nicht geladen werden. Speichern ist gesperrt. Bitte die Ansicht erneut öffnen.'
            : 'Die Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.'}
        </AppNotice>
      )}
      {state === 'saved' && (
        <AppNotice tone="success">Freigegebene Felder gespeichert.</AppNotice>
      )}
      <AppSection
        title="Korrigierbare Angaben"
        description="Standardmäßig ist kein Feld freigegeben."
      >
        {options.map((option) => (
          <AppCheckbox
            key={option.key}
            label={option.label}
            checked={fields.includes(option.key)}
            disabled={!canEdit}
            onChange={(event) =>
              setFields((current) =>
                event.target.checked
                  ? [...current, option.key]
                  : current.filter((key) => key !== option.key),
              )
            }
          />
        ))}
      </AppSection>
      <AppButton
        tone="primary"
        type="button"
        disabled={!canEdit}
        onClick={() => void save()}
      >
        Freigaben speichern
      </AppButton>
    </section>
  );
}
