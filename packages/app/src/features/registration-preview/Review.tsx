import {
  AppButton,
  AppDialog,
  Checkbox,
  Radio,
  RegistrationCard,
  RegistrationNotice,
} from '@nennbox/ui';
import { useState } from 'react';
import {
  classFor,
  entryPrice,
  payableNow,
  sampleEvent,
  totalPrice,
  type PreviewConfig,
  type Step,
} from './model.js';
import { type FormProps } from './PersonFields.js';
import { money, words } from './text.js';

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
  const change = (step: Step) => (
    <AppButton tone="ghost" onClick={() => go(step)}>
      {t('Ändern', 'Edit')}
    </AppButton>
  );
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
  return (
    <>
      <p>
        {t(
          'Das ist die letzte Stelle, an der du etwas ohne E-Mail ans Nennbüro ändern kannst. Jede Gruppe führt zurück zu ihrem Schritt.',
          'This is your last chance to change details before contacting the entry office. Each group takes you back to its step.',
        )}
      </p>
      <RegistrationCard title={w.aboutYou} action={change('person')}>
        <p>
          {draft.person.firstName} {draft.person.lastName} ·{' '}
          {draft.person.birthDate} · {draft.person.country}
        </p>
        <strong className="nb-preview-email">{draft.person.email}</strong>
        <p>
          {draft.person.street}, {draft.person.postalCode} {draft.person.city}
        </p>
        <p>
          {w.phone}: {draft.person.phone || '—'} · {w.licenseNumber}:{' '}
          {draft.person.license}
        </p>
        <p>
          {w.bloodGroup}:{' '}
          {draft.person.bloodGroup || t('keine Angabe', 'not provided')}
        </p>
        <p>
          {w.publicationPreference}:{' '}
          {
            {
              name: w.publicationNameVisible,
              initials: w.publicationInitials,
              anonymous: w.publicationHidden,
            }[draft.person.publication]
          }
        </p>
        {draft.person.guardianName && (
          <p>
            {w.guardianName}: {draft.person.guardianName} ·{' '}
            {draft.person.guardianEmail}
          </p>
        )}
        <h3>{w.emergencyContact}</h3>
        <p>
          {draft.person.emergencyName} · {draft.person.emergencyPhone}
        </p>
      </RegistrationCard>
      {draft.entries.map((entry, i) => (
        <RegistrationCard
          key={entry.id}
          title={`${t('Startmeldung', 'Entry')} ${i + 1}`}
          action={change('vehicle')}
        >
          <p>
            {classFor(entry)?.name} · {money(entryPrice(entry), locale)}{' '}
            {entry.waitlist && t('· Warteliste', '· Waiting list')}
          </p>
          <p>{Object.values(entry.vehicle).filter(Boolean).join(' · ')}</p>
          {entry.replacement && (
            <div className="nb-preview-inset">
              <h3>{w.spareVehicle} · 0 €</h3>
              <p>
                {Object.values(entry.replacement).filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
          {classFor(entry)?.passenger !== 'none' && (
            <>
              <h3>
                {w.passenger} {change('passenger')}
              </h3>
              <p>
                {entry.passenger.pending
                  ? t('wird nachgetragen', 'to be added later')
                  : Object.values(entry.passenger)
                      .filter((v) => typeof v === 'string')
                      .join(' · ')}
              </p>
            </>
          )}
        </RegistrationCard>
      ))}
      {(config.questions || config.uploads) && (
        <RegistrationCard
          title={t('Hinweise des Veranstalters', 'Organiser information')}
          action={change('documents')}
        >
          {config.questions &&
            sampleEvent.questions.map((q) => (
              <p key={q.id}>
                {q.label[locale]}: {String(draft.answers[q.id] ?? '—')}
              </p>
            ))}
          {config.uploads &&
            sampleEvent.documents.map((d) => (
              <p key={d.id}>
                {d.label[locale]}: {draft.uploads[d.id]?.name ?? '—'}
              </p>
            ))}
        </RegistrationCard>
      )}
      <RegistrationCard title={t('Was es kostet', 'What it costs')}>
        {draft.entries.map((entry, i) => (
          <div key={entry.id}>
            <p>
              {t('Startmeldung', 'Entry')} {i + 1} · {classFor(entry)?.name}{' '}
              <strong>{money(entryPrice(entry), locale)}</strong>
            </p>
            {entry.replacement && <p>{w.spareVehicle}: 0 €</p>}
          </div>
        ))}
        <p>
          {t('Startgeld', 'Entry fee')}:{' '}
          <strong>{money(totalPrice(draft), locale)}</strong>
        </p>
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
      <fieldset>
        <legend>{t('Bestätigungen', 'Confirmations')}</legend>
        <p>
          {t(
            'Bitte einzeln bestätigen. Nichts davon ist vorausgewählt.',
            'Please confirm each item individually. Nothing is preselected.',
          )}
        </p>
        {(Object.keys(consents) as (keyof typeof consents)[]).map((key) => (
          <div key={key}>
            <Checkbox
              id={`consents.${key}`}
              checked={draft.consents[key]}
              label={consents[key]}
              onBlur={() => onBlur(`consents.${key}`)}
              onChange={(e) =>
                onDraft({
                  ...draft,
                  consents: { ...draft.consents, [key]: e.target.checked },
                })
              }
            />
            <AppButton tone="ghost" onClick={() => setLegal(consents[key])}>
              {t('Text ansehen', 'Read text')}
            </AppButton>
            {errors[`consents.${key}`] && (
              <p className="nb-preview-error">{errors[`consents.${key}`]}</p>
            )}
          </div>
        ))}
      </fieldset>
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
export function Payment({
  draft,
  locale,
  onDraft,
  config,
}: FormProps & { config: PreviewConfig }) {
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  return (
    <>
      <p>
        {t(
          'Der Verein verlangt das Startgeld sofort. Deine Nennung gilt erst als eingegangen, wenn bezahlt ist.',
          'The organiser requires immediate payment. Your registration is received once payment is complete.',
        )}
      </p>
      <RegistrationNotice>
        {t(
          'Prototyp: keine Zahlung und keine Übermittlung. Der nächste Klick simuliert die Rückkehr.',
          'Prototype: no payment or submission. The next click simulates the return.',
        )}
      </RegistrationNotice>
      <fieldset id="paymentMethod" tabIndex={-1}>
        <legend>{t('Zahlungsart', 'Payment method')}</legend>
        {(['online', 'transfer'] as const).map((method) => (
          <Radio
            key={method}
            name="payment"
            label={
              method === 'online'
                ? t(
                    'Jetzt online bezahlen · Karte, Apple Pay oder SEPA',
                    'Pay online · Card, Apple Pay or SEPA',
                  )
                : t('Überweisung', 'Bank transfer')
            }
            checked={draft.paymentMethod === method}
            onChange={() => onDraft({ ...draft, paymentMethod: method })}
          />
        ))}
      </fieldset>
      <p>
        {t('Gesamtbetrag', 'Total')}:{' '}
        <strong>{money(payableNow(draft, config), locale)}</strong>
      </p>
    </>
  );
}
