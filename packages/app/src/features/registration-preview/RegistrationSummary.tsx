import { Fragment, useState, type ReactNode } from 'react';
import { RegistrationButton } from '@nennbox/ui';
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
      <dl className="nb-reg-rows">
        <Row label={t('Veranstaltung', 'Event')}>
          Historischer Bergpreis 2027
        </Row>
        <Row label={t('Termin', 'Date')}>26.–27. April 2027</Row>
        <Row label={t('Nennungsschluss', 'Entry deadline')}>12. April 2027</Row>
        <Row label={t('Starter', 'Driver')}>
          {draft.person.firstName} {draft.person.lastName}
        </Row>
        {draft.entries.map((entry, i) => (
          <Fragment key={entry.id}>
            <Row label={`${t('Startmeldung', 'Entry')} ${i + 1}`}>
              {classFor(entry)?.name}
            </Row>
            <Row sub>{money(classFor(entry)?.price ?? 0, locale)}</Row>
            {entry.replacement && <Row sub>{w.spareVehicle} · 0 €</Row>}
            {entry.waitlist && (
              <Row sub warn>
                {t('Warteliste · Platz 4', 'Waiting list · position 4')}
              </Row>
            )}
          </Fragment>
        ))}
        <Row label={t('Startgeld', 'Entry fee')} total>
          {money(totalPrice(draft), locale)}
        </Row>
      </dl>
      <p className="nb-reg-summary-note">{costHint}</p>
      <div className="nb-reg-summary-foot">
        <p className="nb-reg-summary-saved">
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
        <RegistrationButton
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
        </RegistrationButton>
        <small className="nb-reg-summary-note">
          {t(
            'Nur auf diesem Gerät nutzbar. Kein E-Mail-Versand.',
            'Works on this device only. No email is sent.',
          )}
        </small>
      </div>
    </>
  );
}

function Row({
  label,
  children,
  sub,
  warn,
  total,
}: {
  label?: string;
  children: ReactNode;
  sub?: boolean;
  warn?: boolean;
  total?: boolean;
}) {
  const flags = `${sub ? ' is-sub' : ''}${warn ? ' is-warn' : ''}${total ? ' is-total' : ''}`;
  return (
    <div className={`nb-reg-row${flags}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
