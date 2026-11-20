import { useState, type CSSProperties, type ReactNode } from 'react';
import { Signet } from '@nennbox/ui';
import {
  deriveAccessibleBrandColors,
  type EventConfigProposal,
} from '@nennbox/contracts';
import { formatRange } from '../format.js';

/** Replays a short highlight whenever the shown value changes, so each answer is visible in the preview. */
export function Flash({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const [state, setState] = useState({ seen: value, tick: 0 });
  if (state.seen !== value) setState({ seen: value, tick: state.tick + 1 });
  return (
    <span key={state.tick} className={state.tick ? 'nb-pv-flash' : undefined}>
      {children}
    </span>
  );
}

export type PreviewProps = {
  proposal: EventConfigProposal;
  logoUrl: string | null;
};

export function brandStyle(proposal: EventConfigProposal): CSSProperties {
  const { organization } = proposal;
  const derived = deriveAccessibleBrandColors(
    organization.primaryColor,
    organization.accentColor,
  );
  return {
    '--pv-primary': derived.primarySurface,
    '--pv-accent': derived.accentSurface,
    '--pv-on-primary': derived.primaryForeground,
    '--pv-on-accent': derived.accentForeground,
    '--pv-link': derived.linkColor,
  } as CSSProperties;
}

export function PreviewHero({ proposal, logoUrl }: PreviewProps) {
  const { organization, event } = proposal;
  return (
    <header className="nb-pv-hero">
      <div className="nb-pv-club">
        {logoUrl ? (
          <img src={logoUrl} alt="" />
        ) : (
          <Signet className="nb-pv-signet" />
        )}
        <Flash value={organization.name}>
          {organization.name || 'Euer Verein'}
        </Flash>
      </div>
      <p className="nb-pv-date">
        <Flash value={`${event.startDate}${event.endDate}`}>
          {event.startDate
            ? formatRange(event.startDate, event.endDate)
            : 'Datum offen'}
        </Flash>
      </p>
      <h2>
        <Flash value={event.title}>{event.title || 'Eure Veranstaltung'}</Flash>
      </h2>
    </header>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="nb-pv-fact">
      <dt>{label}</dt>
      <dd>
        <Flash value={value}>{value}</Flash>
      </dd>
    </div>
  );
}
