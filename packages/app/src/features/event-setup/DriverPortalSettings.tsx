import { useEffect, useState } from 'react';
import { Banner, Button, Checkbox, FormSection } from '@nennbox/ui';
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
export function DriverPortalSettings({
  eventId,
  slug,
}: {
  eventId: string;
  slug: string;
}) {
  const [fields, setFields] = useState<string[]>([]);
  const [state, setState] = useState<
    'loading' | 'ready' | 'saving' | 'error' | 'saved'
  >('loading');
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest(
      `/admin/events/${eventId}/driver-portal-fields`,
      fieldsSchema,
      { signal: controller.signal },
    )
      .then((value) => {
        setFields(value.fields);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [eventId]);
  const save = async () => {
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
      setState('error');
    }
  };
  return (
    <section aria-labelledby="driver-portal-settings-title">
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
      {state === 'error' && (
        <Banner tone="error">
          Die Einstellungen konnten nicht geladen oder gespeichert werden.
        </Banner>
      )}
      {state === 'saved' && (
        <Banner tone="success">Freigegebene Felder gespeichert.</Banner>
      )}
      <FormSection
        title="Korrigierbare Angaben"
        description="Standardmäßig ist kein Feld freigegeben."
      >
        {options.map((option) => (
          <Checkbox
            key={option.key}
            label={option.label}
            checked={fields.includes(option.key)}
            disabled={state === 'loading' || state === 'saving'}
            onChange={(event) =>
              setFields((current) =>
                event.target.checked
                  ? [...current, option.key]
                  : current.filter((key) => key !== option.key),
              )
            }
          />
        ))}
      </FormSection>
      <Button
        type="button"
        disabled={state === 'loading' || state === 'saving'}
        onClick={() => void save()}
      >
        Freigaben speichern
      </Button>
    </section>
  );
}
