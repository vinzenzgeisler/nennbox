import { useState } from 'react';
import { Field, FormSection } from '@nennbox/ui';
import type { RegistrationFormConfig } from '@nennbox/contracts';
import {
  emptyVehicle,
  fieldState,
  translations,
  type DriverContact,
} from './RegistrationDomain.js';
import {
  RegistrationContactFields,
  RegistrationPhoneField,
  RegistrationPublicationField,
} from './RegistrationContactFields.js';
import { RegistrationVehicleDetailFields } from './RegistrationVehicleDetailFields.js';

/** Uses the public field components and the unsaved configuration for an immediate preview. */
export function RegistrationFieldsPreview({
  config,
}: {
  config: RegistrationFormConfig;
}) {
  const [contact, setContact] = useState<DriverContact>({
    phone: '',
    bloodGroup: '',
    licenseNumber: '',
    country: '',
    street: '',
    postalCode: '',
    city: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    publicationPreference: '',
  });
  const [birthDate, setBirthDate] = useState('');
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [requestedNumber, setRequestedNumber] = useState('');
  const t = translations.de;
  return (
    <section
      className="registration field-preview"
      aria-labelledby="field-preview-title"
    >
      <h2 id="field-preview-title">Live-Vorschau · Nennformular</h2>
      <p className="field-preview-note">
        So sehen Teilnehmende die Felder. Eingaben werden nicht gespeichert.
      </p>
      <FormSection title="Fahrer" variant="registration">
        {fieldState(config, 'dateOfBirth') !== 'hidden' && (
          <Field
            label="Geburtsdatum"
            type="date"
            value={birthDate}
            required={fieldState(config, 'dateOfBirth') === 'required'}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        )}
        <RegistrationPhoneField
          config={config}
          values={contact}
          onChange={(patch) =>
            setContact((current) => ({ ...current, ...patch }))
          }
          t={t}
        />
        <RegistrationContactFields
          config={config}
          values={contact}
          onChange={(patch) =>
            setContact((current) => ({ ...current, ...patch }))
          }
          t={t}
        />
        <RegistrationPublicationField
          config={config}
          values={contact}
          onChange={(patch) =>
            setContact((current) => ({ ...current, ...patch }))
          }
          t={t}
        />
      </FormSection>
      <FormSection title="Fahrzeug" variant="registration">
        {fieldState(config, 'requestedStartNumber') !== 'hidden' && (
          <Field
            label="Wunsch-Startnummer"
            required={fieldState(config, 'requestedStartNumber') === 'required'}
            value={requestedNumber}
            onChange={(event) => setRequestedNumber(event.target.value)}
          />
        )}
        <RegistrationVehicleDetailFields
          config={config}
          vehicle={vehicle}
          onChange={(patch) =>
            setVehicle((current) => ({ ...current, ...patch }))
          }
          t={t}
        />
      </FormSection>
    </section>
  );
}
