import { adminFetch } from '../../auth.js';
import {
  AppActions,
  AppButton,
  AppGrid,
  AppNotice,
  AppSection,
  AppSelect,
  AppView,
} from '@nennbox/ui';
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  defaultRegistrationFormConfig,
  mergeRegistrationFormConfig,
  RegistrationFormConfigSchema,
  RegistrationFormConfigPatchSchema,
  type RegistrationFormConfig,
  type RegistrationCustomField,
} from '@nennbox/contracts';
import { RegistrationAppearance } from './RegistrationAppearance.js';
import { RegistrationCustomFields } from './RegistrationCustomFields.js';
import {
  RegistrationFeatureOptions,
  RegistrationFormOptions,
} from './RegistrationFormOptions.js';
import { RegistrationFieldsPreview } from './RegistrationFieldsPreview.js';
import { RegistrationPaymentSettings } from './RegistrationPaymentSettings.js';
import { registrationFieldLabels } from './registrationFieldLabels.js';

export function RegistrationFormSettings({
  eventId,
  embedded = false,
}: {
  eventId: string;
  embedded?: boolean;
}) {
  const [config, setConfig] = useState<RegistrationFormConfig>(
    defaultRegistrationFormConfig,
  );
  const [organizationConfig, setOrganizationConfig] =
    useState<RegistrationFormConfig>(defaultRegistrationFormConfig);
  const [scope, setScope] = useState<'organization' | 'event'>(
    eventId ? 'event' : 'organization',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [eventLoaded, setEventLoaded] = useState(!eventId);
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/organization/registration-form-config', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body: { config: unknown }) => {
        if (active) {
          const parsed = RegistrationFormConfigSchema.parse(body.config);
          setOrganizationConfig(parsed);
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            'Organisations-Einstellungen konnten nicht geladen werden.',
          );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded || scope !== 'event' || !eventId) return;
    let active = true;
    void adminFetch(
      `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`,
      { credentials: 'same-origin', cache: 'no-store' },
    )
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body: { config: unknown } | null) => {
        if (!active) return;
        setConfig(
          body
            ? mergeRegistrationFormConfig(
                organizationConfig,
                RegistrationFormConfigPatchSchema.parse(body.config),
              )
            : organizationConfig,
        );
      })
      .catch(() => {
        if (active)
          setMessage(
            'Veranstaltungs-Einstellungen konnten nicht geladen werden.',
          );
      })
      .finally(() => {
        if (active) setEventLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [scope, eventId, organizationConfig, loaded]);

  const activeConfig = scope === 'organization' ? organizationConfig : config;
  const updateConfig = (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => {
    if (scope === 'organization')
      setOrganizationConfig((current) => updater(current));
    else setConfig((current) => updater(current));
  };
  const change = (patch: Partial<RegistrationFormConfig>) =>
    updateConfig((current) => ({ ...current, ...patch }));
  const updateCustomField = (
    key: string,
    patch: Partial<RegistrationCustomField>,
  ) =>
    updateConfig((current) => ({
      ...current,
      customFields: current.customFields.map((field) =>
        field.key === key ? { ...field, ...patch } : field,
      ),
    }));
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const path =
        scope === 'organization'
          ? '/admin/organization/registration-form-config'
          : `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`;
      const toSave =
        scope === 'event'
          ? {
              ...activeConfig,
              fields: Object.fromEntries(
                Object.entries(activeConfig.fields).filter(
                  ([key, field]) =>
                    field.state !==
                    organizationConfig.fields[
                      key as keyof typeof organizationConfig.fields
                    ].state,
                ),
              ),
            }
          : activeConfig;
      const response = await adminFetch(path, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (!response.ok) throw new Error();
      setMessage('Einstellungen gespeichert.');
    } catch {
      setMessage('Speichern momentan nicht möglich.');
    } finally {
      setBusy(false);
    }
  };
  const upload = async (
    kind: 'logoLight' | 'logoDark' | 'headerImage',
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    const response = await adminFetch(
      '/admin/organization/registration-assets',
      {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      },
    );
    if (!response.ok) {
      setMessage('Datei konnte nicht sicher gespeichert werden.');
      return;
    }
    const body = (await response.json()) as { objectId: string };
    updateConfig((current) => ({
      ...current,
      branding: {
        ...current.branding,
        [kind === 'logoLight'
          ? 'logoLightObjectId'
          : kind === 'logoDark'
            ? 'logoDarkObjectId'
            : 'headerImageObjectId']: body.objectId,
      },
    }));
    setMessage('Datei hochgeladen. Änderungen anschließend speichern.');
  };
  if (!loaded || (scope === 'event' && !eventLoaded))
    return (
      <section aria-busy="true">
        <p role="status">Einstellungen werden geladen …</p>
      </section>
    );
  const saveBar = (
    <AppActions>
      <AppButton
        tone="primary"
        type="button"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? 'Wird gespeichert …' : 'Änderungen speichern'}
      </AppButton>
      {message && (
        <AppNotice
          tone={
            message === 'Einstellungen gespeichert.' ? 'success' : 'warning'
          }
        >
          {message}
        </AppNotice>
      )}
    </AppActions>
  );
  return (
    <AppView>
      <AppSection
        title={
          embedded
            ? 'Formularfelder'
            : 'Nennformular · Erscheinungsbild und Felder'
        }
        {...(embedded
          ? {
              description:
                'Lege fest, welche Angaben Teilnehmende machen. Die Vorschau zeigt das Formular so, wie es ausgeliefert wird.',
            }
          : {})}
      >
        {!embedded && (
          <RegistrationAppearance
            activeConfig={activeConfig}
            updateConfig={updateConfig}
            change={change}
            upload={upload}
          />
        )}
        <AppGrid>
          <div className="nb-app-stack">
            <AppSelect
              label="Geltungsbereich"
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="organization">Organisation</option>
              <option value="event" disabled={!eventId}>
                Veranstaltung · überschreibt Organisation
              </option>
            </AppSelect>
            <RegistrationFormOptions
              config={activeConfig}
              updateConfig={updateConfig}
              fieldLabels={registrationFieldLabels}
            />
            <RegistrationPaymentSettings
              config={activeConfig}
              updateConfig={updateConfig}
            />
            {embedded && saveBar}
          </div>
          <RegistrationFieldsPreview config={activeConfig} />
        </AppGrid>
        {!embedded && (
          <RegistrationCustomFields
            activeConfig={activeConfig}
            updateConfig={updateConfig}
            updateCustomField={updateCustomField}
            change={change}
          />
        )}
        {!embedded && (
          <RegistrationFeatureOptions
            config={activeConfig}
            updateConfig={updateConfig}
          />
        )}
        {!embedded && saveBar}
      </AppSection>
    </AppView>
  );
}
