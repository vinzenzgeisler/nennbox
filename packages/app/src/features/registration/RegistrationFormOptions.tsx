import {
  AppNotice,
  AppValueRow,
  AppCheckbox,
  AppSection,
  SegmentedControl,
  type SegmentedOption,
} from '@nennbox/ui';
import type { RegistrationFormConfig } from '@nennbox/contracts';

type FieldState = RegistrationFormConfig['fields']['dateOfBirth']['state'];

const fieldGroups: Array<{
  title: string;
  keys: Array<keyof RegistrationFormConfig['fields']>;
}> = [
  {
    title: 'Fahrer',
    keys: [
      'dateOfBirth',
      'phone',
      'street',
      'postalCode',
      'city',
      'country',
      'emergencyContact',
      'bloodGroup',
      'licenseNumber',
      'publicationPreference',
    ],
  },
  {
    title: 'Fahrzeug und Start',
    keys: [
      'requestedStartNumber',
      'displacement',
      'cylinders',
      'transponderNumber',
      'vehiclePassNumber',
      'owner',
      'history',
    ],
  },
];

const stateOptions: Array<SegmentedOption<FieldState>> = [
  { value: 'hidden', label: 'Aus' },
  { value: 'optional', label: 'Freiwillig' },
  { value: 'required', label: 'Pflicht' },
];

export function RegistrationFormOptions({
  config,
  updateConfig,
  fieldLabels,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
  fieldLabels: Record<string, string>;
}) {
  return (
    <div className="nb-app-stack">
      {fieldGroups.map((group) => (
        <AppSection key={group.title} title={group.title}>
          {group.keys.map((key) => {
            const label = fieldLabels[key] ?? key;
            return (
              <AppValueRow key={key} label={label}>
                <SegmentedControl
                  appearance="app"
                  label={label}
                  value={config.fields[key].state}
                  options={stateOptions}
                  onChange={(state) =>
                    updateConfig((current) => ({
                      ...current,
                      fields: { ...current.fields, [key]: { state } },
                    }))
                  }
                />
              </AppValueRow>
            );
          })}
        </AppSection>
      ))}
      {config.fields.dateOfBirth.state !== 'required' && (
        <AppNotice tone="warning">
          Alter und Erziehungsberechtigte werden nur geprüft, wenn ein
          Geburtsdatum angegeben wird. Ein Mindestalter der Organisation lehnt
          Nennungen ohne Geburtsdatum ab.
        </AppNotice>
      )}
    </div>
  );
}

export function RegistrationFeatureOptions({
  config,
  updateConfig,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
}) {
  return (
    <AppSection title="Veranstaltungsoptionen">
      <AppCheckbox
        label="Beifahrer"
        checked={config.features.passenger}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: { ...current.features, passenger: event.target.checked },
          }))
        }
      />
      <AppCheckbox
        label="Ersatzfahrzeug"
        checked={config.features.spareVehicle}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: {
              ...current.features,
              spareVehicle: event.target.checked,
            },
          }))
        }
      />
      <AppCheckbox
        label="Mehrere Starts"
        checked={config.features.multipleEntries}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: {
              ...current.features,
              multipleEntries: event.target.checked,
            },
          }))
        }
      />
    </AppSection>
  );
}
