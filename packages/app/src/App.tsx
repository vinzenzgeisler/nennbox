import { DriverPortal } from './features/driver-portal/DriverPortal.js';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import {
  RuntimeBootstrapResponse,
  type RuntimeBootstrapResponse as RuntimeConfig,
} from '@nennbox/contracts';
import './styles.css';
import {
  Registration,
  RegistrationResume,
  RegistrationVerification,
} from './Registration.js';
import { PassengerLink } from './features/passenger/PassengerLink.js';
import { ComponentGallery } from './ComponentGallery.js';
import { AuthenticatedAdmin } from './AdminApplication.js';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; config: RuntimeConfig };

// Clickable onboarding prototype (#201). Development builds and builds made with
// VITE_ONBOARDING_PREVIEW=true only; the condition folds to a constant, so a normal
// production build contains neither the route nor the prototype code.
const OnboardingPreview =
  import.meta.env.DEV || import.meta.env.VITE_ONBOARDING_PREVIEW === 'true'
    ? lazy(() => import('./features/onboarding/OnboardingPreview.js'))
    : null;

export interface AppProps {
  renderContribution?: (config: RuntimeConfig) => ReactNode;
}

export function App({ renderContribution }: AppProps = {}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const isOnboardingPreview =
    OnboardingPreview !== null &&
    window.location.pathname === '/app/onboarding-preview';
  const isAdmin =
    !isOnboardingPreview &&
    (window.location.pathname.startsWith('/admin') ||
      window.location.pathname.startsWith('/app') ||
      window.location.pathname === '/auth/callback');
  const isComponentGallery = window.location.pathname === '/components';
  useEffect(() => {
    if (isAdmin || isComponentGallery || isOnboardingPreview) return;
    let current = true;
    fetch('/runtime/bootstrap', {
      credentials: 'same-origin',
      cache: 'no-cache',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Runtime unavailable');
        return response.json();
      })
      .then((payload: unknown) => RuntimeBootstrapResponse.parse(payload))
      .then((config) => {
        if (current) setState({ kind: 'ready', config });
      })
      .catch(() => {
        if (current) setState({ kind: 'unavailable' });
      });
    return () => {
      current = false;
    };
  }, [isAdmin, isComponentGallery, isOnboardingPreview]);

  if (isComponentGallery) return <ComponentGallery />;

  if (isOnboardingPreview && OnboardingPreview)
    return (
      <Suspense fallback={<p role="status">NENNBOX lädt…</p>}>
        <OnboardingPreview />
      </Suspense>
    );

  if (isAdmin) return <AuthenticatedAdmin />;

  if (state.kind === 'loading')
    return (
      <main className="shell" aria-busy="true">
        <p role="status">NENNBOX lädt…</p>
      </main>
    );
  if (state.kind === 'unavailable')
    return (
      <main className="shell">
        <h1>NENNBOX</h1>
        <p role="alert">This service is currently unavailable.</p>
      </main>
    );

  const { config } = state;
  if (window.location.pathname === '/registration/verify')
    return (
      <main className="shell">
        <RegistrationVerification locale={config.locale} />
      </main>
    );
  const driverPortalMatch = window.location.pathname.match(
    /^\/events\/([^/]+)\/my-entry\/?$/,
  );
  if (driverPortalMatch)
    return (
      <main className="shell registration-shell">
        <DriverPortal eventSlug={decodeURIComponent(driverPortalMatch[1]!)} />
      </main>
    );
  if (window.location.pathname === '/passenger')
    return (
      <main className="shell registration-shell">
        <PassengerLink locale={config.locale} />
      </main>
    );
  if (window.location.pathname === '/registration/resume')
    return (
      <main className="shell">
        <RegistrationResume organizationId={config.organization.id} />
      </main>
    );
  const registrationMatch = window.location.pathname.match(
    /^\/events\/([^/]+)\/register\/?$/,
  );
  if (registrationMatch)
    return (
      <main className="shell registration-shell">
        <Registration
          organizationId={config.organization.id}
          eventSlug={decodeURIComponent(registrationMatch[1]!)}
          defaultLocale={config.locale}
        />
      </main>
    );
  return (
    <main
      className="shell"
      style={
        {
          '--brand-primary': config.branding.primaryColor,
          '--brand-accent': config.branding.accentColor,
        } as React.CSSProperties
      }
    >
      <header className="masthead">
        {config.branding.logoUrl ? (
          <img className="logo" src={config.branding.logoUrl} alt="" />
        ) : null}
        <div>
          <p className="eyebrow">NENNBOX · {config.deploymentMode}</p>
          <h1>{config.organization.name}</h1>
        </div>
      </header>
      {config.activeEvent ? (
        <section aria-labelledby="event-title">
          <h2 id="event-title">{config.activeEvent.name}</h2>
          {config.branding.eventImageUrl ? (
            <img
              className="event-image"
              src={config.branding.eventImageUrl}
              alt=""
            />
          ) : null}
        </section>
      ) : (
        <p>No active event.</p>
      )}
      {config.branding.contactEmail ? (
        <p>
          <a href={`mailto:${config.branding.contactEmail}`}>Contact</a>
        </p>
      ) : null}
      {config.legalLinks.length ? (
        <nav aria-label="Legal information">
          <ul>
            {config.legalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {renderContribution?.(config) ?? null}
    </main>
  );
}
