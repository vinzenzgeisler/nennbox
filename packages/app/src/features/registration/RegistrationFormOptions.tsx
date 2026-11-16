import {
  Banner,
  Checkbox,
  FormSection,
  SegmentedControl,
  type SegmentedOption,
} from '@racepilot/ui';
import type { RegistrationFormConfig } from '@racepilot/contracts';

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
    <div className="field-settings">
      {fieldGroups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ul>
            {group.keys.map((key) => {
              const label = fieldLabels[key] ?? key;
              return (
                <li key={key}>
                  <span>{label}</span>
                  <SegmentedControl
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {config.fields.dateOfBirth.state !== 'required' && (
        <Banner tone="warning">
          Alter und Erziehungsberechtigte werden nur geprüft, wenn ein
          Geburtsdatum angegeben wird. Ein Mindestalter der Organisation lehnt
          Nennungen ohne Geburtsdatum ab.
        </Banner>
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
    <FormSection title="Veranstaltungsoptionen">
      <Checkbox
        label="Beifahrer"
        checked={config.features.passenger}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            features: { ...current.features, passenger: event.target.checked },
          }))
        }
      />
      <Checkbox
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
      <Checkbox
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
    </FormSection>
  );
}
