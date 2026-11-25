import {
  AppDialog,
  RegistrationCard,
  RegistrationConsent,
  RegistrationNotice,
} from '@nennbox/ui';
import { useState, type ReactNode } from 'react';
import {
  classFor,
  entryPrice,
  sampleEvent,
  totalPrice,
  type PreviewConfig,
  type Step,
  type Vehicle,
} from './model.js';
import { type FormProps } from './PersonFields.js';
import { ReviewCard, ReviewRow } from './ReviewParts.js';
import { money, words } from './text.js';

const formatDate = (iso: string, locale: 'de' | 'en') => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? (locale === 'de' ? `${d}.${m}.${y}` : iso) : iso;
};
const countryName = (code: string, locale: 'de' | 'en') =>
  new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;

export { Payment } from './Payment.js';

export function Review({
  draft,
  locale,
  errors,
  onDraft,
  onBlur,
  go,
  config,
}: FormProps & { go: (step: Step) => void; config: PreviewConfig }) {
  const [legal, setLegal] = useState<string | null>(null);
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  const person = draft.person;
  const changeLabel = t('Ändern', 'Edit');
  const card = (title: string, step: Step, rows: ReactNode) => (
    <ReviewCard title={title} change={() => go(step)} changeLabel={changeLabel}>
      {rows}
    </ReviewCard>
  );
  const none = t('keine Angabe', 'not provided');
  const vehicleLine = (v: Vehicle) =>
    `${v.manufacturer} ${v.model}${v.year ? `, ${t('Baujahr', 'built')} ${v.year}` : ''}`;
  const consents = {
    terms: t(
      'Ich habe die Teilnahmebedingungen gelesen.',
      'I have read the participation terms.',
    ),
    privacy: t(
      'Ich habe die Datenschutzhinweise gelesen.',
      'I have read the privacy information.',
    ),
    organizer: t(
      'Ich bestätige den Sicherheitshinweis des Vereins.',
      'I confirm the organiser’s safety information.',
    ),
  };
  const readLabel = {
    terms: t('Teilnahmebedingungen ansehen', 'Read the participation terms'),
    privacy: t('Datenschutzhinweise ansehen', 'Read the privacy information'),
    organizer: t('Sicherheitshinweis ansehen', 'Read the safety information'),
  };
  return (
    <>
      <p className="nb-reg-lead">
        {t(
          'Das ist die letzte Stelle, an der du etwas ohne E-Mail ans Nennbüro ändern kannst. Jede Gruppe führt zurück zu ihrem Schritt.',
          'This is your last chance to change details before contacting the entry office. Each group takes you back to its step.',
        )}
      </p>
      {card(
        w.aboutYou,
        'person',
        <>
          <ReviewRow label={t('Name', 'Name')}>
            {person.firstName} {person.lastName}
          </ReviewRow>
          <ReviewRow label={w.birthDate}>
            {formatDate(person.birthDate, locale)}
          </ReviewRow>
          <ReviewRow label={w.country}>
            {countryName(person.country, locale)}
          </ReviewRow>
          {person.guardianName && (
            <ReviewRow label={w.guardianName}>
              {person.guardianName} · {person.guardianEmail}
            </ReviewRow>
          )}
          <ReviewRow label={w.email} strong>
            <span className="nb-preview-email">{person.email}</span>
          </ReviewRow>
          <ReviewRow label={w.phone} tag={w.optional}>
            {person.phone || '—'}
          </ReviewRow>
          <ReviewRow label={w.address}>
            {person.street}, {person.postalCode} {person.city}
          </ReviewRow>
          <ReviewRow label={w.licenseNumber}>{person.license}</ReviewRow>
          <ReviewRow label={w.bloodGroup} tag={w.optional}>
            {person.bloodGroup || none}
          </ReviewRow>
          <ReviewRow label={w.publicationPreference}>
            {
              {
                name: w.publicationNameVisible,
                initials: w.publicationInitials,
                anonymous: w.publicationHidden,
              }[person.publication]
            }
          </ReviewRow>
        </>,
      )}
      {draft.entries.map((entry, i) => (
        <div className="nb-reg-stack" key={entry.id}>
          {card(
            `${t('Startmeldung', 'Entry')} ${i + 1}`,
            'vehicle',
            <>
              <ReviewRow label={w.class}>
                {classFor(entry)?.name} · {money(entryPrice(entry), locale)}
                {entry.waitlist && ` · ${t('Warteliste', 'Waiting list')}`}
              </ReviewRow>
              <ReviewRow label={t('Fahrzeug', 'Vehicle')}>
                {vehicleLine(entry.vehicle)}
              </ReviewRow>
              <ReviewRow label={w.registration}>
                {entry.vehicle.plate || '—'}
              </ReviewRow>
              <ReviewRow label={w.displacement}>
                {entry.vehicle.displacement} cm³
                {entry.vehicle.cylinders &&
                  ` · ${entry.vehicle.cylinders} ${t('Zylinder', 'cylinders')}`}
              </ReviewRow>
              <ReviewRow label={w.vehiclePassNumber}>
                {entry.vehicle.vehiclePass}
              </ReviewRow>
              <ReviewRow label={w.transponderNumber} tag={w.optional}>
                {entry.vehicle.transponder || none}
              </ReviewRow>
            </>,
          )}
          {entry.replacement &&
            card(
              w.spareVehicle,
              'vehicle',
              <>
                <ReviewRow label={t('Fahrzeug', 'Vehicle')}>
                  {vehicleLine(entry.replacement)}
                </ReviewRow>
                <ReviewRow label={w.registration}>
                  {entry.replacement.plate || '—'}
                </ReviewRow>
                <ReviewRow label={t('Startgeld', 'Entry fee')}>
                  0 € ·{' '}
                  {t(
                    'zählt nicht als eigene Startmeldung',
                    'not a separate entry',
                  )}
                </ReviewRow>
              </>,
            )}
          {classFor(entry)?.passenger !== 'none' &&
            card(
              w.passenger,
              'passenger',
              entry.passenger.pending ? (
                <ReviewRow label={t('Name', 'Name')}>
                  {t('wird nachgetragen', 'to be added later')}
                </ReviewRow>
              ) : (
                <>
                  <ReviewRow label={t('Name', 'Name')}>
                    {entry.passenger.firstName} {entry.passenger.lastName}
                  </ReviewRow>
                  <ReviewRow label={w.email}>{entry.passenger.email}</ReviewRow>
                </>
              ),
            )}
        </div>
      ))}
      {card(
        w.emergencyContact,
        'person',
        <>
          <ReviewRow label={t('Name', 'Name')}>
            {person.emergencyName}
          </ReviewRow>
          <ReviewRow label={w.phone}>{person.emergencyPhone}</ReviewRow>
        </>,
      )}
      {(config.questions || config.uploads) &&
        card(
          t('Hinweise des Veranstalters', 'Organiser information'),
          'documents',
          <>
            {config.questions &&
              sampleEvent.questions.map((q) => (
                <ReviewRow key={q.id} label={q.label[locale]}>
                  {String(draft.answers[q.id] ?? '—')}
                </ReviewRow>
              ))}
            {config.uploads &&
              sampleEvent.documents.map((d) => (
                <ReviewRow key={d.id} label={d.label[locale]}>
                  {draft.uploads[d.id]?.name ?? '—'}
                </ReviewRow>
              ))}
          </>,
        )}
      <RegistrationCard
        className="is-cost"
        title={t('Was es kostet', 'What it costs')}
      >
        {draft.entries.map((entry, i) => (
          <div className="nb-reg-stack" key={entry.id}>
            <div className="nb-reg-cost-row">
              <span>
                {t('Startmeldung', 'Entry')} {i + 1} · {classFor(entry)?.name}
              </span>
              <span>{money(entryPrice(entry), locale)}</span>
            </div>
            {entry.replacement && (
              <div className="nb-reg-cost-row">
                <span>{w.spareVehicle}</span>
                <span>0 €</span>
              </div>
            )}
          </div>
        ))}
        <div className="nb-reg-cost-row is-total">
          <span>{t('Startgeld', 'Entry fee')}</span>
          <strong>{money(totalPrice(draft), locale)}</strong>
        </div>
        <RegistrationNotice>
          {config.instantPayment
            ? t(
                'Der Verein verlangt das Startgeld sofort. Für Wartelistenplätze wird erst beim Nachrücken gezahlt.',
                'The organiser requires immediate payment. Waiting-list places are only payable once admitted.',
              )
            : t(
                'Du zahlst jetzt noch nichts. Der MSC Hohenstein prüft deine Nennung zuerst. Erst wenn du zugelassen bist, bekommst du eine Mail mit dem Zahlungslink und der Bankverbindung. Wenn du nicht zugelassen wirst, entstehen dir keine Kosten.',
                'You pay nothing now. MSC Hohenstein checks your entry first. Once admitted, you receive payment details by email. There is no charge if you are not admitted.',
              )}
        </RegistrationNotice>
      </RegistrationCard>
      <RegistrationCard title={t('Bestätigungen', 'Confirmations')}>
        <p className="nb-reg-hint">
          {t(
            'Bitte einzeln bestätigen. Nichts davon ist vorausgewählt.',
            'Please confirm each item individually. Nothing is preselected.',
          )}
        </p>
        <div className="nb-reg-consents">
          {(Object.keys(consents) as (keyof typeof consents)[]).map((key) => (
            <RegistrationConsent
              key={key}
              id={`consents.${key}`}
              checked={draft.consents[key]}
              label={consents[key]}
              readLabel={readLabel[key]}
              error={errors[`consents.${key}`]}
              onRead={() => setLegal(consents[key])}
              onBlur={() => onBlur(`consents.${key}`)}
              onChange={(e) =>
                onDraft({
                  ...draft,
                  consents: { ...draft.consents, [key]: e.target.checked },
                })
              }
            />
          ))}
        </div>
      </RegistrationCard>
      {legal && (
        <AppDialog
          open
          title={t('Hinweis · Prototyp', 'Notice · Prototype')}
          closeLabel={t('Schließen', 'Close')}
          onClose={() => setLegal(null)}
        >
          <p>{legal}</p>
          <p>
            {t(
              'Lokaler Beispieltext für die Gestaltung, kein gültiger Einwilligungstext.',
              'Local example for design review, not a valid consent document.',
            )}
          </p>
        </AppDialog>
      )}
    </>
  );
}
