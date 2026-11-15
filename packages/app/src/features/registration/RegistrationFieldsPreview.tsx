import { useState } from 'react';
import { Field, FormSection } from '@racepilot/ui';
import type { RegistrationFormConfig } from '@racepilot/contracts';
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
    <FormSection title="Live-Vorschau · Nennformular" variant="registration">
      <p>
        So sehen Teilnehmende die konfigurierten Standardfelder. Eingaben hier
        werden nicht gespeichert.
      </p>
      <FormSection title="Fahrer" variant="registration">
        <Field label="Vorname" value="" readOnly />
        <Field label="Nachname" value="" readOnly />
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
    </FormSection>
  );
}
