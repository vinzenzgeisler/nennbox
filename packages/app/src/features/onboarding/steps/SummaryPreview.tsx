import { useState } from 'react';
import { AppSegmented } from '@nennbox/ui';
import type { EventConfigProposal } from '@nennbox/contracts';
import { EventPagePreview } from '../preview/EventPagePreview.js';
import { FormPreview } from '../preview/FormPreview.js';
import '../preview/preview.css';

type View = 'page' | 'form';

/**
 * The only real preview of the setup: what participants will see, built from the final
 * proposal. Everything before this screen shows lists instead, because nothing stands yet.
 */
export function SummaryPreview({
  proposal,
  logoUrl,
}: {
  proposal: EventConfigProposal;
  logoUrl: string | null;
}) {
  const [view, setView] = useState<View>('page');
  const host = `${proposal.organization.subdomain || 'verein'}.nennbox.com`;
  const address =
    view === 'page'
      ? `${host}/events/${proposal.event.slug}`
      : proposal.registrationUrl.replace('https://', '');
  return (
    <section className="nb-onb-preview" aria-labelledby="nb-onb-preview-title">
      <header className="nb-onb-preview-head">
        <h2 id="nb-onb-preview-title">So sieht es für eure Teilnehmer aus</h2>
        <AppSegmented
          label="Ansicht der Vorschau"
          value={view}
          onChange={(next) => setView(next as View)}
          options={[
            { value: 'page', label: 'Veranstaltungsseite' },
            { value: 'form', label: 'Nennformular' },
          ]}
        />
      </header>
      <div className="nb-onb-browser">
        <div className="nb-onb-browser-bar">
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <span>{address}</span>
        </div>
        <div className="nb-onb-browser-body">
          {view === 'form' ? (
            <FormPreview proposal={proposal} logoUrl={logoUrl} />
          ) : (
            <EventPagePreview proposal={proposal} logoUrl={logoUrl} />
          )}
        </div>
      </div>
      <p className="nb-onb-note">
        Das ist die einzige Stelle im Einrichten mit einer echten Vorschau. Hier
        steht alles fest, vorher nicht.
      </p>
    </section>
  );
}
