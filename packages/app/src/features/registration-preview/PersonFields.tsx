import {
  RegistrationField,
  RegistrationNotice,
  Radio,
  SelectField,
} from '@nennbox/ui';
import {
  ageOnEvent,
  type Draft,
  type Person,
  type ValidationErrors,
} from './model.js';
import { words, type Locale } from './text.js';

export type FormProps = {
  draft: Draft;
  locale: Locale;
  errors: ValidationErrors;
  onDraft: (draft: Draft) => void;
  onBlur: (path: string) => void;
};
export function PersonFields({
  draft,
  locale,
  errors,
  onDraft,
  onBlur,
}: FormProps) {
  const w = words(locale);
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  const set = (key: keyof Person, value: string) =>
    onDraft({ ...draft, person: { ...draft.person, [key]: value } });
  const field = (
    key: keyof Person,
    label: string,
    required = true,
    type = 'text',
    hint?: string,
  ) => {
    if (key === 'country' || key === 'bloodGroup') {
      const options =
        key === 'country'
          ? [
              ['DE', w.germany],
              ['AT', w.austria],
              ['CH', w.switzerland],
              ['NL', t('Niederlande', 'Netherlands')],
            ]
          : ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', '0+', '0−'].map(
              (value) => [value, value || t('Bitte wählen', 'Please select')],
            );
      return (
        <RegistrationField
          key={key}
          id={`person.${key}`}
          label={label}
          required={required}
          requiredLabel={w.required}
          optionalLabel={w.optional}
          hint={hint}
          error={errors[`person.${key}`]}
        >
          {(control) => (
            <SelectField
              {...control}
              label={label}
              labelHidden
              value={draft.person[key]}
              onChange={(event) => set(key, event.target.value)}
              onBlur={() => onBlur(`person.${key}`)}
            >
              {options.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
        </RegistrationField>
      );
    }
    return (
      <RegistrationField
        key={key}
        id={`person.${key}`}
        label={label}
        required={required}
        requiredLabel={w.required}
        optionalLabel={w.optional}
        type={type}
        value={draft.person[key]}
        onChange={(e) => set(key, e.target.value)}
        onBlur={() => onBlur(`person.${key}`)}
        error={errors[`person.${key}`]}
        hint={hint}
        autoComplete={
          key === 'email' ? 'email' : key === 'birthDate' ? 'bday' : undefined
        }
        inputMode={key === 'postalCode' ? 'numeric' : undefined}
      />
    );
  };
  const age = ageOnEvent(draft.person.birthDate);
  return (
    <>
      <p>
        {t(
          'Diese Angaben braucht der Veranstalter für die Startliste, die Zeitnahme und den Notfall. Du kannst jederzeit aufhören, dein Entwurf bleibt gespeichert.',
          'The organiser needs these details for the start list, timing and emergencies. You can stop at any time; your draft stays saved.',
        )}
      </p>
      <fieldset>
        <legend>{t('Name und Geburtsdatum', 'Name and date of birth')}</legend>
        <p>{t('Wie im Ausweis', 'As shown on your ID')}</p>
        <div className="nb-reg-pair">
          {field('firstName', w.firstName)}
          {field('lastName', w.lastName)}
        </div>
        {field('birthDate', w.birthDate, true, 'date')}
        {field('country', w.country)}
        {age !== null && age < 12 ? (
          <RegistrationNotice tone="error">
            {w.minAge}{' '}
            {t(
              'Der MSC Hohenstein lässt Starter ab 12 Jahren zu. Bitte prüfe das Datum oder wende dich an das Nennbüro.',
              'MSC Hohenstein accepts drivers aged 12 and over. Check the date or contact the entry office.',
            )}
          </RegistrationNotice>
        ) : age !== null && age < 18 ? (
          <>
            <RegistrationNotice>
              {t(
                'Weil du noch nicht volljährig bist, braucht der Veranstalter die Zustimmung einer erziehungsberechtigten Person. Sie bekommt eine eigene E-Mail und unterschreibt dort.',
                'As you are under 18, the organiser needs permission from a parent or guardian. They receive their own email to sign. (Simulated)',
              )}
            </RegistrationNotice>
            {field('guardianName', w.guardianName)}
            {field('guardianEmail', w.guardianEmail, true, 'email')}
          </>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>{t('Kontakt', 'Contact')}</legend>
        {field(
          'email',
          w.email,
          true,
          'email',
          t(
            'Hierhin geht die Bestätigung und der Link zu deiner Nennung.',
            'Your confirmation and registration link will be sent here.',
          ),
        )}
        {field('phone', w.phone, false, 'tel', w.phoneHint)}
      </fieldset>
      <fieldset>
        <legend>{w.address}</legend>
        {field('street', w.street)}
        <div className="nb-reg-pair">
          {field('postalCode', w.postalCode)}
          {field('city', w.city)}
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('Lizenz und Gesundheit', 'Licence and health')}</legend>
        {field(
          'license',
          w.licenseNumber,
          true,
          'text',
          t(
            'Steht auf deiner Lizenzkarte oben rechts.',
            'Shown at the top right of your licence card.',
          ),
        )}
        {field(
          'bloodGroup',
          w.bloodGroup,
          false,
          'text',
          t(
            'Nur für den Notfall vor Ort. Wird nach der Veranstaltung gelöscht und erscheint in keiner Liste. Im Prototyp nur lokal gespeichert.',
            'For on-site emergencies only. Deleted after the event and never published. Stored locally only in this prototype.',
          ),
        )}
      </fieldset>
      <fieldset>
        <legend>{w.emergencyContact}</legend>
        {field('emergencyName', w.emergencyContactName)}
        {field('emergencyPhone', w.emergencyContactPhone, true, 'tel')}
      </fieldset>
      <fieldset>
        <legend>{w.publicationPreference}</legend>
        <p>
          {t(
            'So erscheinst du in der öffentlichen Starterliste',
            'How you appear in the public start list',
          )}
        </p>
        {(['name', 'initials', 'anonymous'] as const).map((value, index) => (
          <Radio
            key={value}
            name="publication"
            label={
              [
                w.publicationNameVisible,
                w.publicationInitials,
                w.publicationHidden,
              ][index]!
            }
            checked={draft.person.publication === value}
            onChange={() => set('publication', value)}
          />
        ))}
      </fieldset>
    </>
  );
}
