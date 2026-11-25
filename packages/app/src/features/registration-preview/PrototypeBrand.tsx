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
          <img
            alt="MSC Hohenstein · Beispiellogo"
            src="/registration-preview-logo.svg"
          />
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
