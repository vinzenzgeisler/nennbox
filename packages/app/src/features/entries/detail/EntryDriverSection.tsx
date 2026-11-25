import { EntryWarnings } from '../warnings/EntryWarnings.js';
import type { EntryWarning } from '../warnings/entryWarnings.js';
import { useState } from 'react';
import {
  AppStatusPill,
  Banner,
  AppButton,
  Button,
  DateInput,
  DetailNote,
  DetailSection,
  FieldGrid,
  FieldItem,
  FieldValue,
  FormActions,
  FormGrid,
  FormWide,
  SelectField,
  TextInput,
} from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { BLOOD_GROUPS } from '@nennbox/contracts';
import type { EntryDriverUpdateRequest } from '@nennbox/contracts';
import {
  COUNTRY_CODES,
  NOT_GIVEN,
  PUBLICATION_LABELS,
  countryName,
  formatBirthDate,
} from './entryDetailModel.js';
import type { Outcome } from '../AdminEntriesModel.js';

type Driver = NonNullable<Entry['adminDetails']>['driver'];
const Value = ({ children }: { children: string | null | undefined }) => (
  <FieldValue empty={NOT_GIVEN}>{children}</FieldValue>
);

export function EntryDriverSection({
  driver,
  warnings,
  passenger,
  busy,
  onSave,
}: {
  warnings?: EntryWarning[] | undefined;
  driver: Driver;
  passenger: { firstName: string; lastName: string } | null;
  busy: boolean;
  onSave: (patch: EntryDriverUpdateRequest) => Promise<Outcome>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const start = () => {
    setDraft({
      firstName: driver.firstName,
      lastName: driver.lastName,
      dateOfBirth: driver.dateOfBirth ?? '',
      country: driver.country ?? '',
      phone: driver.phone ?? '',
      bloodGroup: driver.bloodGroup ?? '',
      licenseNumber: driver.licenseNumber ?? '',
      street: driver.street ?? '',
      postalCode: driver.postalCode ?? '',
      city: driver.city ?? '',
      emergencyContactName: driver.emergencyContactName ?? '',
      emergencyContactPhone: driver.emergencyContactPhone ?? '',
      publicationPreference: driver.publicationPreference ?? '',
    });
    setError('');
    setEditing(true);
  };
  const bind = (key: string) => ({
    value: draft[key] ?? '',
    onChange: (event: { target: { value: string } }) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  });
  async function save() {
    const text = (key: string) => draft[key]?.trim() || null;
    const next: EntryDriverUpdateRequest = {
      firstName: draft.firstName?.trim() ?? '',
      lastName: draft.lastName?.trim() ?? '',
      dateOfBirth: text('dateOfBirth'),
      country: text('country'),
      phone: text('phone'),
      bloodGroup: text('bloodGroup') as EntryDriverUpdateRequest['bloodGroup'],
      licenseNumber: text('licenseNumber'),
      street: text('street'),
      postalCode: text('postalCode'),
      city: text('city'),
      emergencyContactName: text('emergencyContactName'),
      emergencyContactPhone: text('emergencyContactPhone'),
      publicationPreference:
        (text('publicationPreference') as Driver['publicationPreference']) ??
        null,
    };
    // Only fields the admin changed are sent, so untouched values are never rewritten.
    const current = (key: string) => driver[key as keyof Driver] ?? null;
    const patch = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => current(key) !== value),
    ) as EntryDriverUpdateRequest;
    if (!Object.keys(patch).length) return setEditing(false);
    const result = await onSave(patch);
    if (result.ok) setEditing(false);
    else setError(result.message);
  }
  const countries = [...COUNTRY_CODES] as string[];
  if (draft.country && !countries.includes(draft.country))
    countries.push(draft.country);
  return (
    <DetailSection
      title="Fahrer"
      action={
        !editing ? (
          <AppButton tone="ghost" onClick={start}>
            Bearbeiten
          </AppButton>
        ) : undefined
      }
    >
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FormGrid>
            <TextInput
              label="Vorname"
              required
              disabled={driver.identityShared === true}
              {...bind('firstName')}
            />
            <TextInput
              label="Nachname"
              required
              disabled={driver.identityShared === true}
              {...bind('lastName')}
            />
            <DateInput
              label="Geburtsdatum"
              disabled={driver.identityShared === true}
              {...bind('dateOfBirth')}
            />
            <SelectField
              label="Land"
              disabled={driver.identityShared === true}
              {...bind('country')}
            >
              <option value="">{NOT_GIVEN}</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryName(code)}
                </option>
              ))}
            </SelectField>
            <TextInput label="Telefon" type="tel" {...bind('phone')} />
            <SelectField label="Blutgruppe" {...bind('bloodGroup')}>
              <option value="">{NOT_GIVEN}</option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </SelectField>
            <TextInput label="Lizenznummer" {...bind('licenseNumber')} />
            <TextInput label="Straße und Nr." {...bind('street')} />
            <TextInput label="PLZ" {...bind('postalCode')} />
            <TextInput label="Ort" {...bind('city')} />
            <TextInput
              label="Notfallkontakt · Name"
              {...bind('emergencyContactName')}
            />
            <TextInput
              label="Notfallkontakt · Telefon"
              type="tel"
              {...bind('emergencyContactPhone')}
            />
            <SelectField
              label="Veröffentlichung"
              {...bind('publicationPreference')}
            >
              <option value="">{NOT_GIVEN}</option>
              {Object.entries(PUBLICATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
            <FormWide>
              <DetailNote>
                {driver.emailVerified
                  ? 'Die E-Mail-Adresse ist bestätigt und wird hier nicht geändert.'
                  : 'Die E-Mail-Adresse wird hier nicht geändert.'}{' '}
                {driver.identityShared
                  ? 'Name, Geburtsdatum und Land gehören zur Person und gelten auch für ihre Nennungen in anderen Veranstaltungen; sie lassen sich hier nicht ändern. '
                  : ''}
                Telefon, Anschrift, Notfallkontakt und Veröffentlichung gelten
                nur für diese Anmeldung
                {(driver.registrationEntryCount ?? 1) > 1
                  ? ` und alle ${driver.registrationEntryCount} Nennungen darin`
                  : ''}
                .
              </DetailNote>
            </FormWide>
          </FormGrid>
          {error && <Banner tone="error">{error}</Banner>}
          <FormActions>
            <Button
              type="submit"
              size={40}
              disabled={
                busy || !draft.firstName?.trim() || !draft.lastName?.trim()
              }
            >
              Speichern
            </Button>
            <Button
              variant="secondary"
              size={40}
              onClick={() => setEditing(false)}
            >
              Abbrechen
            </Button>
          </FormActions>
        </form>
      ) : (
        <FieldGrid>
          <FieldItem label="Name">
            <Value>{driver.name}</Value>
            <EntryWarnings
              warnings={warnings}
              fields={['firstName', 'lastName']}
            />
          </FieldItem>
          <FieldItem label="Geburtsdatum">
            <Value>{formatBirthDate(driver.dateOfBirth)}</Value>
            <EntryWarnings
              warnings={warnings}
              fields={['dateOfBirth', 'guardianName']}
            />
          </FieldItem>
          <FieldItem label="Land">
            <Value>{countryName(driver.country)}</Value>
          </FieldItem>
          <FieldItem label="E-Mail">
            <Value>{driver.email}</Value>
            <EntryWarnings warnings={warnings} fields={['email']} />{' '}
            {driver.emailVerified && (
              <AppStatusPill status="zu">bestätigt</AppStatusPill>
            )}
          </FieldItem>
          <FieldItem label="Blutgruppe">
            <Value>{driver.bloodGroup}</Value>
          </FieldItem>
          <FieldItem label="Lizenznummer">
            <Value>{driver.licenseNumber}</Value>
            <EntryWarnings warnings={warnings} fields={['licenseValidUntil']} />
          </FieldItem>
          <FieldItem label="Telefon">
            <Value>{driver.phone}</Value>
          </FieldItem>
          <FieldItem label="Anschrift">
            <Value>
              {[
                driver.street,
                [driver.postalCode, driver.city].filter(Boolean).join(' '),
              ]
                .filter(Boolean)
                .join(', ')}
            </Value>
          </FieldItem>
          <FieldItem label="Notfallkontakt">
            <Value>
              {[driver.emergencyContactName, driver.emergencyContactPhone]
                .filter(Boolean)
                .join(' · ')}
            </Value>
          </FieldItem>
          <FieldItem label="Beifahrer">
            <Value>
              {passenger
                ? `${passenger.firstName} ${passenger.lastName}`
                : null}
            </Value>
          </FieldItem>
          <FieldItem label="Veröffentlichung">
            <Value>
              {driver.publicationPreference
                ? PUBLICATION_LABELS[driver.publicationPreference]
                : null}
            </Value>
          </FieldItem>
        </FieldGrid>
      )}
    </DetailSection>
  );
}
