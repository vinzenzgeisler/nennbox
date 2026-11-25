import sampleLogo from './logo.svg';
import { type Locale } from './text.js';
export function PrototypeBrand({
  logo,
  themeId,
}: {
  logo: boolean;
  themeId: string;
}) {
  return (
    <>
      <span className="nb-preview-logo">
        {logo ? (
          <img alt="MSC Hohenstein · Beispiellogo" src={sampleLogo} />
        ) : (
          'MSC'
        )}
      </span>
      <strong>
        {themeId === 'kart'
          ? 'Kart Club Sonne'
          : themeId === 'tradition'
            ? 'Oldtimer Freunde Taunus'
            : themeId === 'modern'
              ? 'Rennsport Nord e. V.'
              : 'MSC Hohenstein e. V.'}
      </strong>
    </>
  );
}
export function PrototypeFooter({
  locale,
  sponsors,
}: {
  locale: Locale;
  sponsors: boolean;
}) {
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  return (
    <>
      <p>
        MSC Hohenstein e. V. ·{' '}
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
