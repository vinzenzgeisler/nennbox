import { useEffect, useState } from 'react';
import { Button, Inline, Stack, StatusLabel } from '@racepilot/ui';
import type { EventConfigProposal } from '@racepilot/contracts';
import type { Outcome } from '../state.js';

function useQrCode(url: string) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let current = true;
    import('qrcode')
      .then(({ default: qr }) =>
        qr.toString(url, {
          type: 'svg',
          margin: 0,
          color: { dark: '#111A16', light: '#FFFFFF' },
        }),
      )
      .then((markup) => current && setSvg(markup))
      .catch(() => current && setSvg(''));
    return () => {
      current = false;
    };
  }, [url]);
  return svg;
}

export function SuccessScreen({
  proposal,
  outcome,
  onReset,
}: {
  proposal: EventConfigProposal;
  outcome: Outcome;
  onReset: () => void;
}) {
  const url = proposal.registrationUrl;
  const qr = useQrCode(url);
  const [copied, setCopied] = useState(false);
  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const open = outcome === 'open';
  const steps = [
    proposal.payment.stripe === 'later' && {
      title: 'Online-Zahlung aktivieren',
      text: 'Verbindet euer Konto mit Stripe, damit Teilnehmer online zahlen können.',
    },
    {
      title: 'Nennformular testen',
      text: 'Legt eine Probe-Nennung an und seht, was Teilnehmer sehen.',
    },
    proposal.startNumbers.mode === 'assigned' && {
      title: 'Startnummern vergeben',
      text: `Verteilt die Nummern ${proposal.startNumbers.range.from} bis ${proposal.startNumbers.range.to} auf eure Klassen.`,
    },
    {
      title: 'Teilnahmebedingungen prüfen',
      text: 'Der Mustertext ersetzt keine rechtliche Prüfung.',
    },
    {
      title: 'Helfer einladen',
      text: 'Gebt eurem Team Zugang zur Nennungsverwaltung.',
    },
  ].filter((step): step is { title: string; text: string } => !!step);
  return (
    <section className="nb-onb-success" aria-labelledby="nb-onb-success-title">
      <p className="nb-question-eyebrow">Fertig</p>
      <h1
        id="nb-onb-success-title"
        className="nb-question-title"
        tabIndex={-1}
        ref={(node) => node?.focus()}
      >
        {open ? 'Eure Nennung ist offen.' : 'Euer Entwurf ist gespeichert.'}
      </h1>
      <p className="nb-question-lead">
        {open
          ? 'Teilt den Link oder den QR-Code. Die ersten Nennungen erscheinen in eurer Verwaltung.'
          : 'Ihr könnt die Nennung jederzeit öffnen. Bis dahin sehen Teilnehmer nichts.'}
      </p>
      <div className="nb-onb-share">
        <div className="nb-onb-share-main">
          <StatusLabel
            status={open ? 'done' : 'in_progress'}
            label={open ? 'Nennung offen' : 'Entwurf'}
          />
          <p className="nb-onb-share-title">{proposal.event.title}</p>
          <p className="nb-onb-share-url">{url}</p>
          <Inline gap={3}>
            <Button
              size={48}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(url)
                  .then(() => setCopied(true));
              }}
            >
              {copied ? 'Link kopiert' : 'Link kopieren'}
            </Button>
            {canShare && (
              <Button
                variant="secondary"
                size={48}
                onClick={() =>
                  void navigator.share({ title: proposal.event.title, url })
                }
              >
                Teilen
              </Button>
            )}
          </Inline>
          <p className="nb-onb-note">
            Prototyp: Diese Adresse wird erst mit der Anbindung an NENNBOX
            aktiv.
          </p>
        </div>
        {qr && (
          <div
            className="nb-onb-qr"
            role="img"
            aria-label={`QR-Code für ${url}`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        )}
      </div>
      <Stack gap={4}>
        <h2 className="nb-onb-followup-title">Als Nächstes</h2>
        <ol className="nb-onb-next">
          {steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <p className="nb-onb-note">
          Diese Schritte erscheinen als Checkliste auf eurer Startseite.
        </p>
        <div>
          <Button variant="text" size={48} onClick={onReset}>
            Prototyp neu starten
          </Button>
        </div>
      </Stack>
    </section>
  );
}
