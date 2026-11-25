import { useId, useState } from 'react';
import {
  RegistrationButton,
  RegistrationField,
  RegistrationNotice,
} from '@nennbox/ui';
import {
  Skeleton,
  SurfacePill,
  SurfaceActions,
  SurfaceRows,
} from './SurfaceParts.js';
import { surfaceRows } from './surfaceRows.js';
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

  const action = (
    label: string,
    run: () => void,
    tone: 'primary' | 'ghost' = 'primary',
  ) => (
    <RegistrationButton key={label} tone={tone} onClick={run}>
      {label}
    </RegistrationButton>
  );
  if (surface === 'form') return null;
  const { confirmationRows, admittedRows, bankRows } = surfaceRows(
    t,
    isWaitlist,
    amount,
  );

  return (
    <section aria-labelledby={titleId} className="nb-reg-surface">
      <SurfacePill
        surface={surface}
        locale={locale}
        waitlist={isWaitlist && confirmation}
      />
      <h1 id={titleId}>{copy?.title[locale]}</h1>
      {copy && <p className="nb-reg-surface-lead">{copy.body[locale]}</p>}
      {confirmation && (
        <>
          <SurfaceRows rows={confirmationRows} />
          <RegistrationNotice
            title={t(
              'Bestätige jetzt deine E-Mail-Adresse',
              'Verify your email address now',
            )}
          >
            {confirmationNotice(locale, isWaitlist, email)}
          </RegistrationNotice>
          <SurfaceActions>
            {action(t('Meine Nennung ansehen', 'View my entry'), onResume)}
            {action(
              t('PDF · Simulation', 'PDF · simulation'),
              () =>
                downloadPreviewConfirmation(locale, email, amount, isWaitlist),
              'ghost',
            )}
            {action(
              t('E-Mail-Bestätigung simulieren', 'Simulate email verification'),
              () => onSurface('verify-loading'),
              'ghost',
            )}
          </SurfaceActions>
        </>
      )}
      {surface === 'admitted' && (
        <>
          <SurfaceRows rows={admittedRows} />
          <div className="nb-reg-bank">
            <h2>
              {t('Überweisung · fiktive Daten', 'Transfer · fictional data')}
            </h2>
            <RegistrationNotice tone="warning">
              {t(
                'Nicht überweisen! Diese Kontodaten sind absichtlich ungültig und nur für die lokale Vorschau.',
                'Do not transfer money! These account details are deliberately invalid and only for this local preview.',
              )}
            </RegistrationNotice>
            <dl>
              {bankRows.flatMap(([label, value]) => [
                <dt key={`${label}-k`}>{label}</dt>,
                <dd key={`${label}-v`}>{value}</dd>,
              ])}
            </dl>
          </div>
          <p className="nb-reg-hint">
            {t(
              'Im echten Ablauf muss der Zahlungszweck genau übernommen werden, sonst findet der Verein die Zahlung nicht.',
              'In the real flow the reference must be copied exactly so the club can match the payment.',
            )}
          </p>
          <SurfaceActions>
            {action(
              t('Online zahlen · Simulation', 'Pay online · simulation'),
              retryPayment,
            )}
            {action(
              t('Später erinnern', 'Remind me later'),
              () =>
                simulate(
                  'Simulation: Lokale Erinnerung vorgemerkt. Es wird keine Nachricht versendet.',
                  'Simulation: Local reminder noted. No message will be sent.',
                ),
              'ghost',
            )}
          </SurfaceActions>
        </>
      )}
      {surface.startsWith('payment-') && (
        <>
          <SurfaceRows rows={[[t('Startgeld', 'Entry fee'), amount]]} />
          <SurfaceActions>
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
                'ghost',
              )}
            {surface === 'payment-cancelled' &&
              action(t('Später zahlen', 'Pay later'), onResume, 'ghost')}
            {(surface === 'payment-success' || surface === 'payment-pending') &&
              action(t('Zur Nennung', 'View entry'), onResume)}
            {surface === 'payment-pending' &&
              action(
                t('Zahlungseingang simulieren', 'Simulate payment received'),
                () => onSurface('payment-success'),
                'ghost',
              )}
          </SurfaceActions>
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
          className="nb-reg-stack"
          onSubmit={(event) => {
            event.preventDefault();
            requestLink();
          }}
          noValidate
        >
          <RegistrationField
            label={t('E-Mail-Adresse', 'Email address')}
            type="email"
            autoComplete="email"
            value={address}
            required
            requiredLabel={t('Erforderlich', 'Required')}
            error={
              invalidEmail
                ? t(
                    'Bitte gib eine gültige E-Mail-Adresse ein.',
                    'Please enter a valid email address.',
                  )
                : undefined
            }
            onChange={(event) => {
              setAddress(event.target.value);
              setInvalidEmail(false);
              setFeedback('');
            }}
          />
          <SurfaceActions>
            <RegistrationButton type="submit" tone="primary">
              {t('Neuen Link senden · simulieren', 'Send new link · simulate')}
            </RegistrationButton>
          </SurfaceActions>
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
          <Skeleton label={t('Laden', 'Loading')} />
          {action(
            t('Laden lokal abschließen', 'Complete simulated loading'),
            onResume,
          )}
        </>
      )}
      {feedback && (
        <RegistrationNotice tone="success" announce>
          {feedback}
        </RegistrationNotice>
      )}
      <p className="nb-reg-sim">
        {t(
          'Lokale Simulation · Keine echten Nennungen, Zahlungen oder E-Mails. Alle Aktionen bleiben in dieser Vorschau.',
          'Local simulation · No real entries, payments or emails. All actions stay in this preview.',
        )}
      </p>
    </section>
  );
}
