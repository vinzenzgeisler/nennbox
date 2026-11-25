import {
  RegistrationAddButton,
  RegistrationButton,
  RegistrationCard,
  RegistrationField,
  RegistrationNotice,
  RegistrationOptionCard,
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
    const hints: Partial<Record<keyof Vehicle, string>> = {
      transponder: t(
        'Nur bei elektronischer Zeitnahme.',
        'Only for electronic timing.',
      ),
      owner: t(
        'Nur ausfüllen, wenn das Fahrzeug jemand anderem gehört.',
        'Only fill in if someone else owns the vehicle.',
      ),
      history: t(
        'Erscheint im Programmheft, wenn der Veranstalter eines macht.',
        'Appears in the programme if the organiser publishes one.',
      ),
    };
    const input = (key: keyof Vehicle, label: string, required: boolean) => (
      <RegistrationField
        key={key}
        id={`${prefix}.${key}`}
        label={label}
        required={required}
        requiredLabel={w.required}
        optionalLabel={w.optional}
        hint={hints[key]}
        className={key === 'plate' ? 'is-plate' : ''}
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
    );
    return (
      <div className="nb-reg-stack">
        <div className="nb-reg-grid-2">
          {input('manufacturer', w.make, true)}
          {input('model', w.model, true)}
        </div>
        <div className={`nb-reg-grid-${replacement ? 2 : 3} is-keep-pair`}>
          {input('year', w.year, true)}
          {input('plate', w.registration, false)}
          {!replacement && input('displacement', w.displacement, true)}
        </div>
        {!replacement && (
          <>
            <div className="nb-reg-grid-3">
              {input('cylinders', w.cylinders, false)}
              {input('transponder', w.transponderNumber, false)}
              {input('vehiclePass', w.vehiclePassNumber, true)}
            </div>
            <div className="nb-reg-grid-2">
              {input('owner', w.owner, false)}
              {input('history', w.history, false)}
            </div>
          </>
        )}
      </div>
    );
  };
  return (
    <>
      <p className="nb-reg-lead">
        {t(
          'Eine Startmeldung ist ein Fahrzeug in einer Klasse. Wenn du mit zwei Fahrzeugen oder in zwei Klassen startest, sind das zwei Startmeldungen mit zwei Startgeldern.',
          'One entry is one vehicle in one class. Two vehicles or two classes mean two entries with two entry fees.',
        )}
      </p>
      {draft.entries.map((entry, index) => (
        <RegistrationCard
          key={entry.id}
          title={
            <>
              <span className="nb-reg-num" aria-hidden="true">
                {index + 1}
              </span>
              {`${t('Startmeldung', 'Entry')} ${index + 1}`}
            </>
          }
          action={
            <>
              {index > 0 && (
                <RegistrationButton
                  tone="danger"
                  onClick={() =>
                    onDraft({
                      ...draft,
                      entries: draft.entries.filter((e) => e.id !== entry.id),
                    })
                  }
                >
                  {w.remove}
                </RegistrationButton>
              )}
              <strong className="nb-reg-card-price">
                {money(entryPrice(entry), locale)}
              </strong>
            </>
          }
        >
          <fieldset id={`entries.${index}.classId`} tabIndex={-1}>
            <legend>
              {w.class} · {w.required}
            </legend>
            <div className="nb-reg-options">
              {sampleEvent.classes.map((cls) => (
                <RegistrationOptionCard
                  key={cls.id}
                  name={`class-${entry.id}`}
                  checked={entry.classId === cls.id}
                  label={cls.name}
                  price={money(cls.price, locale)}
                  unavailable={cls.available === 0}
                  detailTone={cls.available ? 'free' : undefined}
                  detail={
                    cls.available
                      ? t(
                          `${cls.available} von ${cls.capacity} Plätzen frei`,
                          `${cls.available} of ${cls.capacity} places available`,
                        )
                      : t(
                          `ausgebucht · ${cls.waitlistCount} auf der Warteliste`,
                          `full · ${cls.waitlistCount} on the waiting list`,
                        )
                  }
                  onChange={() =>
                    patch(index, { classId: cls.id, waitlist: false })
                  }
                />
              ))}
            </div>
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
            <div className="nb-reg-spare-box">
              <header>
                <strong>{w.spareVehicle}</strong>
                <span className="nb-reg-tag">0 €</span>
                <RegistrationButton
                  tone="danger"
                  onClick={() => patch(index, { replacement: null })}
                >
                  {w.remove}
                </RegistrationButton>
              </header>
              <p className="nb-reg-hint">
                {t(
                  'zählt nicht als Startmeldung · 0 €',
                  'not a separate entry · €0',
                )}
              </p>
              {fields(entry, index, true)}
              <p className="nb-reg-hint">
                {t(
                  'Das Ersatzfahrzeug startet in derselben Klasse. Wenn es eine andere Klasse bräuchte, leg stattdessen eine weitere Startmeldung an.',
                  'The spare vehicle uses the same class. Add another entry if it needs a different class.',
                )}
              </p>
            </div>
          ) : (
            <RegistrationAddButton
              variant="spare"
              title={w.addSpareVehicle}
              description={t(
                'Falls dieses Fahrzeug vor Ort ausfällt. Keine eigene Startmeldung.',
                'In case this vehicle fails on site. Not a separate entry.',
              )}
              tag="0 €"
              onClick={() => patch(index, { replacement: { ...emptyVehicle } })}
            />
          )}
        </RegistrationCard>
      ))}
      <RegistrationAddButton
        variant="add"
        title={w.addVehicle}
        description={t(
          'Eigene Startmeldung mit eigener Klasse und eigenem Startgeld.',
          'A separate entry with its own class and entry fee.',
        )}
        tag={t('ab 80 €', 'from €80')}
        onClick={() =>
          onDraft({
            ...draft,
            entries: [...draft.entries, createEntry(`entry-${Date.now()}`)],
          })
        }
      />
    </>
  );
}
