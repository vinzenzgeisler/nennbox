import sampleLogo from './logo.svg';
import {
  type RegistrationAccentNotice,
  type RegistrationClub,
} from '@nennbox/ui';
import { accentHint, type Locale } from './text.js';
export function PrototypeBrand({
  logo,
  club,
}: {
  logo: boolean;
  club: RegistrationClub;
}) {
  return (
    <>
      <span className="nb-preview-logo">
        {logo ? (
          <img alt={`${club.name} · Beispiellogo`} src={sampleLogo} />
        ) : (
          club.initials
        )}
      </span>
      <strong>{club.name}</strong>
    </>
  );
}
export function PrototypeFooter({
  locale,
  club,
  sponsors,
}: {
  locale: Locale;
  club: RegistrationClub;
  sponsors: boolean;
}) {
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  return (
    <>
      <p>
        {club.name} ·{' '}
        {t(
          'Kontakt und Impressum: lokale Beispieldaten',
          'Contact and legal notice: local example data',
        )}{' '}
        · nennbuero@example.invalid
      </p>
      {sponsors && (
        <div className="nb-preview-sponsors">
          <span>{t('Unterstützt von', 'Supported by')}</span>
          {['AUTOTEIL', 'REIFEN', 'BRAUEREI', 'KFZ'].map((name) => (
            <strong key={name}>{name}</strong>
          ))}
        </div>
      )}
    </>
  );
}

export function PrototypeBanner({
  header,
  locale,
}: {
  header: string;
  locale: Locale;
}) {
  if (header !== 'bildband' && header !== 'farbband') return null;
  return (
    <div
      className={
        header === 'bildband' ? 'nb-preview-imageband' : 'nb-preview-colorband'
      }
    >
      <strong>Historischer Bergpreis 2027</strong>
      <span>
        {locale === 'de'
          ? '26. bis 27. April 2027 · Nennungsschluss 12. April'
          : '26–27 April 2027 · Entry deadline 12 April'}
      </span>
    </div>
  );
}

// Club identity belonging to each example theme (P8); the accent comes from the theme.
export const themeClubs: Record<string, string> = {
  standard: 'msc',
  tradition: 'oft',
  modern: 'rn',
  kart: 'kcs',
};

export function AccentHint({
  notice,
  locale,
}: {
  notice: RegistrationAccentNotice | null;
  locale: Locale;
}) {
  if (!notice) return null;
  return (
    <p className="nb-preview-palette-hint" data-notice={notice}>
      {accentHint(notice, locale)}
    </p>
  );
}
