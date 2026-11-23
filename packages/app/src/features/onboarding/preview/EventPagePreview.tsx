import { formatEuro } from '@nennbox/contracts';
import { formatDay } from '../../../format.js';
import {
  brandStyle,
  Fact,
  Flash,
  PreviewHero,
  type PreviewProps,
} from './Pieces.js';

const payments = {
  online: 'Online per Karte, Apple Pay oder SEPA',
  transfer: 'Per Überweisung',
  both: 'Online oder per Überweisung',
} as const;

export function EventPagePreview({ proposal, logoUrl }: PreviewProps) {
  const { event, classes, payment } = proposal;
  const chosen = !proposal.missing.includes('kind');
  const cheapest = classes.length
    ? Math.min(...classes.map((item) => item.feeCents))
    : 0;
  const mode = payment.online
    ? payment.bankTransfer
      ? 'both'
      : 'online'
    : 'transfer';
  return (
    <div className="nb-pv" style={brandStyle(proposal)} aria-hidden="true">
      <PreviewHero proposal={proposal} logoUrl={logoUrl} />
      <div className="nb-pv-hero nb-pv-hero-facts">
        <dl>
          <Fact label="Ort" value={event.location || 'Ort offen'} />
          <Fact label="Nennschluss" value={formatDay(event.entryDeadline)} />
          <Fact
            label="Startgeld ab"
            value={classes.length ? formatEuro(cheapest) : '–'}
          />
          <Fact
            label="Plätze"
            value={
              chosen
                ? `${event.capacity}${event.waitlist ? ' + Warteliste' : ''}`
                : '–'
            }
          />
        </dl>
      </div>
      <section className="nb-pv-section">
        <h3>Klassen und Startgeld</h3>
        <ul className="nb-pv-list">
          {classes.map((item) => (
            <li key={item.id}>
              <Flash value={`${item.name}${item.feeCents}`}>
                {item.name || 'Neue Klasse'}
              </Flash>
              <span>{formatEuro(item.feeCents)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="nb-pv-section">
        <h3>So nennst du</h3>
        <ol className="nb-pv-steps">
          <li>Fahrer- und Fahrzeugdaten eingeben</li>
          <li>
            <Flash value={`${proposal.documents.length}`}>
              {proposal.documents.map((item) => item.name).join(', ')} hochladen
            </Flash>
          </li>
          <li>
            <Flash value={mode}>{payments[mode]} bezahlen</Flash>
          </li>
        </ol>
        <p className="nb-pv-cta">Jetzt nennen</p>
      </section>
    </div>
  );
}
