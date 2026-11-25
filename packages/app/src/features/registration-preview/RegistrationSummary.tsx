import { useState } from 'react';
import { AppButton } from '@nennbox/ui';
import { classFor, totalPrice, type Draft } from './model.js';
import { words, money, type Locale } from './text.js';
export function RegistrationSummary({
  draft,
  locale,
  costHint,
  savedAt,
  storageFailed,
}: {
  draft: Draft;
  locale: Locale;
  costHint: string;
  savedAt: string;
  storageFailed: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  return (
    <>
      <dl>
        <dt>{t('Veranstaltung', 'Event')}</dt>
        <dd>Historischer Bergpreis 2027</dd>
        <dt>{t('Termin', 'Date')}</dt>
        <dd>26.–27. April 2027</dd>
        <dt>{t('Nennungsschluss', 'Entry deadline')}</dt>
        <dd>12. April 2027</dd>
        <dt>{t('Starter', 'Driver')}</dt>
        <dd>
          {draft.person.firstName} {draft.person.lastName}
        </dd>
        {draft.entries.map((entry, i) => (
          <div key={entry.id}>
            <dt>
              {t('Startmeldung', 'Entry')} {i + 1}
            </dt>
            <dd>
              {classFor(entry)?.name} ·{' '}
              {money(classFor(entry)?.price ?? 0, locale)}
            </dd>
            {entry.replacement && <dd>{w.spareVehicle} · 0 €</dd>}
            {entry.waitlist && (
              <dd>{t('Warteliste · Platz 4', 'Waiting list · position 4')}</dd>
            )}
          </div>
        ))}
        <dt>{t('Startgeld', 'Entry fee')}</dt>
        <dd>{money(totalPrice(draft), locale)}</dd>
      </dl>
      <p>{costHint}</p>
      <p className="nb-preview-saved">
        {storageFailed
          ? t(
              'Nur diese Sitzung · Speichern nicht möglich',
              'This session only · unable to save',
            )
          : savedAt
            ? `✓ ${t('Entwurf gespeichert', 'Draft saved')} · ${savedAt}`
            : t(
                'Lokaler Beispielentwurf · noch nicht gespeichert',
                'Local example draft · not yet saved',
              )}
      </p>
      <AppButton
        tone="ghost"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(
              `${window.location.origin}/app/registration-preview#local-draft`,
            )
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied
          ? t('Lokalen Link kopiert', 'Local link copied')
          : t('Link zum Fortsetzen kopieren', 'Copy resume link')}
      </AppButton>
      <small>
        {t(
          'Nur auf diesem Gerät nutzbar. Kein E-Mail-Versand.',
          'Works on this device only. No email is sent.',
        )}
      </small>
    </>
  );
}
