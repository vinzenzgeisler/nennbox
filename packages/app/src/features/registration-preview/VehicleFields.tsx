import {
  AppButton,
  RegistrationCard,
  RegistrationField,
  RegistrationNotice,
  Radio,
  Checkbox,
} from '@nennbox/ui';
import {
  classFor,
  createEntry,
  emptyVehicle,
  entryPrice,
  sampleEvent,
  type Entry,
  type Vehicle,
} from './model.js';
import { type FormProps } from './PersonFields.js';
import { money, words } from './text.js';

export function VehicleFields({
  draft,
  locale,
  errors,
  onDraft,
  onBlur,
}: FormProps) {
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  const patch = (index: number, values: Partial<Entry>) =>
    onDraft({
      ...draft,
      entries: draft.entries.map((e, i) =>
        i === index ? { ...e, ...values } : e,
      ),
    });
  const fields = (entry: Entry, index: number, replacement = false) => {
    const vehicle = replacement ? entry.replacement! : entry.vehicle;
    const prefix = `entries.${index}.${replacement ? 'replacement' : 'vehicle'}`;
    const items: [keyof Vehicle, string, boolean][] = [
      ['manufacturer', w.make, true],
      ['model', w.model, true],
      ['year', w.year, true],
      ['plate', w.registration, false],
      ...(replacement
        ? []
        : ([
            ['displacement', w.displacement, true],
            ['cylinders', w.cylinders, false],
            ['transponder', w.transponderNumber, false],
            ['vehiclePass', w.vehiclePassNumber, true],
            ['owner', w.owner, false],
            ['history', w.history, false],
          ] as [keyof Vehicle, string, boolean][])),
    ];
    return items.map(([key, label, required]) => (
      <RegistrationField
        key={key}
        id={`${prefix}.${key}`}
        label={label}
        required={required}
        requiredLabel={w.required}
        optionalLabel={w.optional}
        value={vehicle[key]}
        error={errors[`${prefix}.${key}`]}
        inputMode={
          ['year', 'displacement', 'cylinders'].includes(key)
            ? 'numeric'
            : undefined
        }
        onBlur={() => onBlur(`${prefix}.${key}`)}
        onChange={(e) =>
          patch(index, {
            [replacement ? 'replacement' : 'vehicle']: {
              ...vehicle,
              [key]: e.target.value,
            },
          })
        }
      />
    ));
  };
  return (
    <>
      <p>
        {t(
          'Eine Startmeldung ist ein Fahrzeug in einer Klasse. Wenn du mit zwei Fahrzeugen oder in zwei Klassen startest, sind das zwei Startmeldungen mit zwei Startgeldern.',
          'One entry is one vehicle in one class. Two vehicles or two classes mean two entries with two entry fees.',
        )}
      </p>
      {draft.entries.map((entry, index) => (
        <RegistrationCard
          key={entry.id}
          title={`${t('Startmeldung', 'Entry')} ${index + 1}`}
          action={
            <>
              <strong>{money(entryPrice(entry), locale)}</strong>
              {index > 0 && (
                <AppButton
                  tone="ghost"
                  onClick={() =>
                    onDraft({
                      ...draft,
                      entries: draft.entries.filter((e) => e.id !== entry.id),
                    })
                  }
                >
                  {w.remove}
                </AppButton>
              )}
            </>
          }
        >
          <fieldset id={`entries.${index}.classId`} tabIndex={-1}>
            <legend>
              {w.class} · {w.required}
            </legend>
            {sampleEvent.classes.map((cls) => (
              <div
                key={cls.id}
                className={`nb-reg-class${entry.classId === cls.id ? ' is-selected' : ''}`}
              >
                <Radio
                  name={`class-${entry.id}`}
                  checked={entry.classId === cls.id}
                  label={`${cls.name} · ${money(cls.price, locale)} · ${cls.available ? t(`${cls.available} von ${cls.capacity} Plätzen frei`, `${cls.available} of ${cls.capacity} places available`) : t('ausgebucht · 3 auf der Warteliste', 'full · 3 on the waiting list')}`}
                  onChange={() =>
                    patch(index, { classId: cls.id, waitlist: false })
                  }
                />
              </div>
            ))}
            {errors[`entries.${index}.classId`] && (
              <p role="alert">{errors[`entries.${index}.classId`]}</p>
            )}
          </fieldset>
          {classFor(entry)?.available === 0 && (
            <RegistrationNotice
              tone="warning"
              title={t('Rennwagen ist ausgebucht', 'Racing cars is full')}
            >
              <p>
                {t(
                  'Alle 30 Plätze sind vergeben, 3 Starter stehen auf der Warteliste. Du kannst trotzdem nennen, dann stehst du an Platz 4.',
                  'All 30 places are taken; 3 drivers are waiting. You can still enter and join in position 4.',
                )}
              </p>
              <Checkbox
                id={`entries.${index}.waitlist`}
                label={t(
                  'Auf die Warteliste · Zahlung erst beim Nachrücken',
                  'Join the waiting list · payment only when a place opens',
                )}
                checked={entry.waitlist}
                onChange={(e) => patch(index, { waitlist: e.target.checked })}
              />
              {errors[`entries.${index}.waitlist`] && (
                <p>{errors[`entries.${index}.waitlist`]}</p>
              )}
            </RegistrationNotice>
          )}
          {fields(entry, index)}
          {entry.replacement ? (
            <RegistrationCard
              inset
              title={w.spareVehicle}
              description={t(
                'zählt nicht als Startmeldung · 0 €',
                'not a separate entry · €0',
              )}
              action={
                <AppButton
                  tone="ghost"
                  onClick={() => patch(index, { replacement: null })}
                >
                  {w.remove}
                </AppButton>
              }
            >
              {fields(entry, index, true)}
              <p>
                {t(
                  'Das Ersatzfahrzeug startet in derselben Klasse. Wenn es eine andere Klasse bräuchte, leg stattdessen eine weitere Startmeldung an.',
                  'The spare vehicle uses the same class. Add another entry if it needs a different class.',
                )}
              </p>
            </RegistrationCard>
          ) : (
            <AppButton
              onClick={() => patch(index, { replacement: { ...emptyVehicle } })}
            >
              {w.addSpareVehicle} · 0 €
            </AppButton>
          )}
        </RegistrationCard>
      ))}
      <AppButton
        onClick={() =>
          onDraft({
            ...draft,
            entries: [...draft.entries, createEntry(`entry-${Date.now()}`)],
          })
        }
      >
        {w.addVehicle} · {t('ab 80 €', 'from €80')}
      </AppButton>
      <p>
        {t(
          'Eigene Startmeldung mit eigener Klasse und eigenem Startgeld.',
          'A separate entry with its own class and entry fee.',
        )}
      </p>
    </>
  );
}
