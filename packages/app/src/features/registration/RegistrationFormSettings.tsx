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
import { useState, type ChangeEvent } from 'react';
import {
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

import {
  changedOverrides,
  useRegistrationConfig,
} from './useRegistrationConfig.js';
import { RegistrationInheritance } from './RegistrationInheritance.js';

type Notice = { text: string; tone: 'success' | 'info' | 'error' };
export function RegistrationFormSettings({
  eventId,
  embedded = false,
}: {
  eventId: string;
  embedded?: boolean;
}) {
  const {
    config,
    organizationConfig,
    setOrganizationConfig,
    overrides,
    setOverrides,
    loaded,
    error,
  } = useRegistrationConfig(eventId);
  const [scope, setScope] = useState<'organization' | 'event'>(
    eventId ? 'event' : 'organization',
  );
  const [busy, setBusy] = useState(false);
  const [refundProblem, setRefundProblem] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [paymentReset, setPaymentReset] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fail = (text: string) => setNotice({ text, tone: 'error' });
  const activeConfig = scope === 'organization' ? organizationConfig : config;
  const updateConfig = (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => {
    if (scope === 'organization')
      setOrganizationConfig((current) => updater(current));
    else
      setOverrides((current) =>
        changedOverrides(current, config, updater(config)),
      );
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
    if (!loaded || error || busy) return;
    if (refundProblem) {
      setShowProblems(true);
      fail(refundProblem);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const path =
        scope === 'organization'
          ? '/admin/organization/registration-form-config'
          : `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`;
      const toSave = scope === 'event' ? overrides : activeConfig;
      const response = await adminFetch(path, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (!response.ok) throw new Error();
      setNotice({ text: 'Einstellungen gespeichert.', tone: 'success' });
    } catch {
      fail('Speichern momentan nicht möglich.');
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
      fail('Datei konnte nicht sicher gespeichert werden.');
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
    setNotice({
      text: 'Datei hochgeladen. Änderungen anschließend speichern.',
      tone: 'info',
    });
  };
  if (error)
    return (
      <AppNotice tone="error">
        {error} Speichern ist gesperrt. Bitte die Ansicht erneut öffnen.
      </AppNotice>
    );
  if (!loaded)
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
      {notice && <AppNotice tone={notice.tone}>{notice.text}</AppNotice>}
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
            {scope === 'event' && (
              <RegistrationInheritance
                overrides={overrides}
                busy={busy}
                embedded={embedded}
                reset={(key) => {
                  setOverrides((current) => {
                    const next = { ...current };
                    delete next[key];
                    return next;
                  });
                  if (key === 'payments') setPaymentReset((value) => value + 1);
                }}
              />
            )}
            <RegistrationFormOptions
              config={activeConfig}
              updateConfig={updateConfig}
              fieldLabels={registrationFieldLabels}
            />
            {!embedded && (
              <RegistrationPaymentSettings
                key={`${scope}:${paymentReset}`}
                config={activeConfig}
                updateConfig={updateConfig}
                onRefundProblem={setRefundProblem}
                showProblems={showProblems}
              />
            )}
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
