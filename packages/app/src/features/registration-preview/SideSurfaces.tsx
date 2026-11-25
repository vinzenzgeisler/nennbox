import { useId, useState } from 'react';
import {
  AppActions,
  AppButton,
  AppNotice,
  AppTextInput,
  AppValueRow,
} from '@nennbox/ui';
import {
  confirmationNotice,
  downloadPreviewConfirmation,
  surfaceCopy,
  type Surface,
} from './surfaces.js';

export type SideSurfacesProps = {
  surface: Surface;
  locale: 'de' | 'en';
  email: string;
  amount: string;
  onSurface: (surface: Surface) => void;
  onResume: () => void;
  waitlist?: boolean;
};

export function SideSurfaces(props: SideSurfacesProps) {
  // Remount local transient state when a preview surface or language changes.
  return <SurfaceContent key={`${props.surface}-${props.locale}`} {...props} />;
}

function SurfaceContent({
  surface,
  locale,
  email,
  amount,
  onSurface,
  onResume,
  waitlist = false,
}: SideSurfacesProps) {
  const titleId = useId();
  const [address, setAddress] = useState(email);
  const [feedback, setFeedback] = useState('');
  const [invalidEmail, setInvalidEmail] = useState(false);
  const t = (de: string, en: string) => (locale === 'de' ? de : en);
  const isWaitlist = surface === 'waitlist' || waitlist;
  const confirmation = surface === 'confirmation' || surface === 'waitlist';
  const copy = surfaceCopy[confirmation && isWaitlist ? 'waitlist' : surface];
  const simulate = (de: string, en: string) => setFeedback(t(de, en));
  const requestLink = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setInvalidEmail(true);
      return;
    }
    setInvalidEmail(false);
    simulate(
      `Simulation: Neuer Link für ${address} vorbereitet. Es wurde keine E-Mail verschickt.`,
      `Simulation: New link prepared for ${address}. No email was sent.`,
    );
  };
  const retryPayment = () => onSurface('payment-pending');

  const action = (label: string, run: () => void) => (
    <AppButton onClick={run}>{label}</AppButton>
  );
  const row = (label: string, value: string) => (
    <AppValueRow label={label}>{value}</AppValueRow>
  );
  if (surface === 'form') return null;

  return (
    <section aria-labelledby={titleId} className="nb-app-stack">
      <AppNotice tone="info">
        {t(
          'Lokale Simulation · Keine echten Nennungen, Zahlungen oder E-Mails. Alle Aktionen bleiben in dieser Vorschau.',
          'Local simulation · No real entries, payments or emails. All actions stay in this preview.',
        )}
      </AppNotice>
      <h2 id={titleId}>{copy?.title[locale]}</h2>
      {copy && <p>{copy.body[locale]}</p>}
      {confirmation && (
        <>
          {[
            [t('Nennung', 'Entry'), isWaitlist ? 'BP27-4419' : 'BP27-4417'],
            [
              t('Startmeldung', 'Vehicle entry'),
              'Porsche 911 SC · ' +
                (isWaitlist
                  ? t('Rennwagen', 'Racing cars')
                  : t('Serienwagen über 1600', 'Production cars over 1600')),
            ],
            [
              isWaitlist
                ? t('Platz auf der Warteliste', 'Waiting list position')
                : t('Status', 'Status'),
              isWaitlist
                ? t('4 von 4', '4 of 4')
                : t(
                    'Eingegangen, noch nicht zugelassen',
                    'Received, not yet admitted',
                  ),
            ],
            [
              t('Startgeld', 'Entry fee'),
              amount +
                ' · ' +
                (isWaitlist
                  ? t('fällig beim Nachrücken', 'due when you move up')
                  : t('fällig nach Zulassung', 'due after admission')),
            ],
          ].map(([label, value]) => (
            <AppValueRow key={label} label={label}>
              {value}
            </AppValueRow>
          ))}
          <AppNotice
            title={t(
              'Bestätige jetzt deine E-Mail-Adresse',
              'Verify your email address now',
            )}
          >
            {confirmationNotice(locale, isWaitlist, email)}
          </AppNotice>
          <AppActions>
            {action(t('Meine Nennung ansehen', 'View my entry'), onResume)}
            {action(t('PDF · Simulation', 'PDF · simulation'), () =>
              downloadPreviewConfirmation(locale, email, amount, isWaitlist),
            )}
            {action(
              t('E-Mail-Bestätigung simulieren', 'Simulate email verification'),
              () => onSurface('verify-loading'),
            )}
          </AppActions>
        </>
      )}
      {surface === 'admitted' && (
        <>
          {row(t('Nennung', 'Entry'), 'BP27-4417')}
          {row(
            t('Startnummer', 'Number'),
            '42 · ' + t('freigegeben', 'released'),
          )}
          {row(
            t('Klasse', 'Class'),
            t('Serienwagen über 1600 cm³', 'Production cars over 1600 cc'),
          )}
          {row(
            t('Zu zahlen', 'Amount due'),
            amount + t(' bis 19. April', ' by 19 April'),
          )}
          <h3>
            {t('Überweisung · fiktive Daten', 'Transfer · fictional data')}
          </h3>
          <AppNotice tone="warning">
            {t(
              'Nicht überweisen! Diese Kontodaten sind absichtlich ungültig und nur für die lokale Vorschau.',
              'Do not transfer money! These account details are deliberately invalid and only for this local preview.',
            )}
          </AppNotice>
          {row(t('Empfänger', 'Recipient'), 'DEMO · MSC Hohenstein e. V.')}
          {row('IBAN', 'DE00 0000 0000 0000 0000 00')}
          {row(t('Betrag', 'Amount'), amount)}
          {row(t('Zahlungszweck', 'Reference'), 'DEMO-BP27-4417-PROBE')}
          <p>
            {t(
              'Im echten Ablauf muss der Zahlungszweck genau übernommen werden, sonst findet der Verein die Zahlung nicht.',
              'In the real flow the reference must be copied exactly so the club can match the payment.',
            )}
          </p>
          <AppActions>
            {action(
              t('Online zahlen · Simulation', 'Pay online · simulation'),
              retryPayment,
            )}
            {action(t('Später erinnern', 'Remind me later'), () =>
              simulate(
                'Simulation: Lokale Erinnerung vorgemerkt. Es wird keine Nachricht versendet.',
                'Simulation: Local reminder noted. No message will be sent.',
              ),
            )}
          </AppActions>
        </>
      )}
      {surface.startsWith('payment-') && (
        <>
          <AppValueRow label={t('Startgeld', 'Entry fee')}>
            {amount}
          </AppValueRow>
          <AppActions>
            {(surface === 'payment-cancelled' ||
              surface === 'payment-failed') &&
              action(
                t('Erneut bezahlen · simulieren', 'Retry payment · simulate'),
                retryPayment,
              )}
            {surface === 'payment-failed' &&
              action(
                t('Auf Überweisung wechseln', 'Switch to bank transfer'),
                () => onSurface('admitted'),
              )}
            {surface === 'payment-cancelled' &&
              action(t('Später zahlen', 'Pay later'), onResume)}
            {(surface === 'payment-success' || surface === 'payment-pending') &&
              action(t('Zur Nennung', 'View entry'), onResume)}
            {surface === 'payment-pending' &&
              action(
                t('Zahlungseingang simulieren', 'Simulate payment received'),
                () => onSurface('payment-success'),
              )}
          </AppActions>
        </>
      )}
      {surface === 'verify-loading' &&
        action(
          t('Prüfung lokal abschließen', 'Complete local verification'),
          () => onSurface('verify-success'),
        )}
      {surface === 'verify-success' &&
        action(t('Meine Nennung ansehen', 'View my entry'), onResume)}
      {surface === 'verify-error' &&
        action(t('Erneut versuchen', 'Try again'), () =>
          onSurface('verify-loading'),
        )}
      {(surface === 'resume-expired' || surface === 'verify-expired') && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            requestLink();
          }}
          noValidate
        >
          <AppTextInput
            label={t('E-Mail-Adresse', 'Email address')}
            type="email"
            autoComplete="email"
            value={address}
            required
            aria-invalid={invalidEmail}
            onChange={(event) => {
              setAddress(event.target.value);
              setInvalidEmail(false);
              setFeedback('');
            }}
            hint={
              invalidEmail
                ? t(
                    'Bitte gib eine gültige E-Mail-Adresse ein.',
                    'Please enter a valid email address.',
                  )
                : ''
            }
          />
          <AppButton type="submit" tone="primary">
            {t('Neuen Link senden · simulieren', 'Send new link · simulate')}
          </AppButton>
        </form>
      )}
      {surface === 'resume-loading' &&
        action(t('Entwurf lokal öffnen', 'Open local draft'), onResume)}
      {surface === 'deadline' &&
        action(t('Nennbüro schreiben', 'Contact registration office'), () =>
          simulate(
            'Simulation: Anfrage an das Nennbüro vorbereitet. Es wurde keine Nachricht versendet.',
            'Simulation: Enquiry to the registration office prepared. No message was sent.',
          ),
        )}
      {surface === 'cancelled' &&
        action(t('Zur Vereinsseite', 'Club website'), () =>
          simulate(
            'Simulation: MSC Hohenstein e. V. · Vereinsinformationen. Es wird keine externe Seite geöffnet.',
            'Simulation: MSC Hohenstein e. V. · Club information. No external page is opened.',
          ),
        )}
      {surface === 'locked' &&
        action(t('Erneut prüfen · Simulation', 'Retry · simulation'), () =>
          onSurface('loading'),
        )}
      {surface === 'sending' &&
        action(
          t('Senden lokal abschließen', 'Complete simulated submission'),
          () => onSurface(waitlist ? 'waitlist' : 'confirmation'),
        )}
      {surface === 'loading' && (
        <>
          <div aria-busy="true" aria-label={t('Laden', 'Loading')}>
            {[
              t('Vorname', 'First name'),
              t('Nachname', 'Last name'),
              t('E-Mail-Adresse', 'Email address'),
            ].map((label) => (
              <AppTextInput key={label} label={label} disabled />
            ))}
          </div>
          {action(
            t('Laden lokal abschließen', 'Complete simulated loading'),
            onResume,
          )}
        </>
      )}
      {feedback && <AppNotice tone="success">{feedback}</AppNotice>}
    </section>
  );
}
