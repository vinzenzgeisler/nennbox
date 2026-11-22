import { useEffect, useState } from 'react';
import { AppButton, AppStatusPill } from '@nennbox/ui';
import {
  formatEuro,
  type EventConfigProposal,
  type OnboardingAnswers,
  type OnboardingStepId,
} from '@nennbox/contracts';
import { formatDay, formatRange } from '../format.js';
import { languageName } from '../languages.js';
import type { Outcome } from '../state.js';

async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = url;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  }
}

function useQrCode(url: string) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!url) return;
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

type Check = {
  title: string;
  detail: string;
  done: boolean;
  /** Screen that fixes an open item; items without a screen only inform. */
  fix?: OnboardingStepId;
};

export function SuccessScreen({
  proposal,
  answers,
  outcome,
  go,
  onOpen,
  onReset,
}: {
  proposal: EventConfigProposal;
  answers: OnboardingAnswers;
  outcome: Outcome;
  go: (step: OnboardingStepId) => void;
  onOpen: () => void;
  onReset: () => void;
}) {
  const url = proposal.registrationUrl;
  const open = outcome === 'open';
  const qr = useQrCode(open ? url : '');
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: proposal.event.title, url });
        return;
      } catch {
        // A dismissed share sheet should leave the link available to copy.
        return;
      }
    }
    setCopied(await copyLink(url));
  };
  const { event, classes } = proposal;
  const fees = classes.map((item) => item.feeCents);
  const extra = proposal.languages.slice(1);
  const checks: Check[] = [
    {
      title: 'Klassen und Startgeld stehen',
      detail: classes.length
        ? `${classes.length} Klassen, ${formatEuro(Math.min(...fees))} bis ${formatEuro(Math.max(...fees))}`
        : 'Noch keine Klasse',
      done: classes.length > 0,
      fix: 'classes',
    },
    {
      title: 'Termin, Ort und Nennschluss stehen',
      detail: `${formatRange(event.startDate, event.endDate)}, Nennschluss ${formatDay(event.entryDeadline)}`,
      done: Boolean(event.startDate && event.location),
      fix: 'when',
    },
    {
      title: 'Teilnahmebedingungen geprüft',
      detail:
        answers.terms === null
          ? 'Mustertext, noch nicht angepasst oder geprüft'
          : 'Angepasster Text, noch nicht rechtlich geprüft',
      done: false,
      fix: 'terms',
    },
    ...(extra.length
      ? [
          {
            title: 'Klassennamen übersetzt',
            detail: `${extra.map(languageName).join(' und ')} fehlt${extra.length > 1 ? 'en' : ''} noch`,
            done: false,
          },
        ]
      : []),
  ];
  const done = checks.filter((item) => item.done).length;
  const steps = [
    {
      title: 'Nennformular testen',
      text: 'Füllt euer eigenes Formular einmal als Teilnehmer aus. Danach wisst ihr, was ankommt.',
      first: true,
    },
    proposal.payment.stripe === 'later' && {
      title: 'Online-Zahlung aktivieren',
      text: 'Verbindet euer Konto mit Stripe, damit Teilnehmer online zahlen können.',
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
      text: 'Gebt eurem Team Zugang, bevor die ersten echten Nennungen kommen.',
    },
  ].filter(
    (step): step is { title: string; text: string; first?: boolean } => !!step,
  );
  return (
    <section className="nb-onb-success" aria-labelledby="nb-onb-success-title">
      <div className="nb-onb-success-head">
        <AppStatusPill status={open ? 'zu' : 'vor'}>
          {open ? 'Nennung offen' : 'Entwurf · nur für euch sichtbar'}
        </AppStatusPill>
        <h1
          id="nb-onb-success-title"
          className="nb-question-title"
          tabIndex={-1}
          ref={(node) => node?.focus()}
        >
          {open ? 'Eure Nennung ist offen.' : 'Euer Entwurf steht.'}
        </h1>
        <p className="nb-question-lead">
          {open
            ? 'Teilt den Link oder den QR-Code. Die ersten Nennungen erscheinen in eurer Verwaltung.'
            : 'Noch ist nichts öffentlich. Schaut euch alles in Ruhe an, füllt euer Formular einmal selbst aus und öffnet die Nennung, wenn ihr so weit seid.'}
        </p>
      </div>
      <div className="nb-onb-share">
        <div className="nb-onb-share-main">
          <p className="nb-onb-share-label">
            {open ? 'Link zur Nennung' : 'Vorschau-Link'}
          </p>
          <p className="nb-onb-share-url">{url}</p>
          <div className="nb-onb-share-actions">
            <AppButton
              tone="primary"
              onClick={() => void copyLink(url).then(setCopied)}
            >
              {copied ? 'Link kopiert' : 'Link kopieren'}
            </AppButton>
            <AppButton onClick={() => go('summary')}>
              Vorschau ansehen
            </AppButton>
            {open && <AppButton onClick={() => void share()}>Teilen</AppButton>}
          </div>
          <p className="nb-onb-note">
            {open
              ? 'Prototyp: Diese Adresse wird erst mit der Anbindung an NENNBOX aktiv.'
              : 'Prototyp: Der Entwurf bleibt auf diesem Gerät. Die Adresse wird erst mit der Anbindung an NENNBOX aktiv.'}
          </p>
        </div>
        {open && qr ? (
          <div
            className="nb-onb-qr"
            role="img"
            aria-label={`QR-Code für ${url}`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        ) : (
          !open && (
            <p className="nb-onb-note nb-onb-qr-hint">
              Der QR-Code für Aushang und Flyer entsteht beim Öffnen.
            </p>
          )
        )}
      </div>
      <div className="nb-onb-after">
        <h2 className="nb-onb-followup-title">Als Nächstes</h2>
        <ol className="nb-onb-next">
          {steps.map((step) => (
            <li key={step.title}>
              <strong>
                {step.title}
                {step.first && <span className="nb-onb-first">Zuerst</span>}
              </strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="nb-onb-ready">
        <div className="nb-onb-ready-head">
          <h2 className="nb-onb-followup-title">Bereit zum Öffnen?</h2>
          <span>{`${done} von ${checks.length} erledigt`}</span>
        </div>
        <ul>
          {checks.map((item) => (
            <li key={item.title} className={item.done ? 'is-done' : undefined}>
              <i aria-hidden="true" />
              <span className="nb-onb-ready-text">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              {!item.done && item.fix && (
                <AppButton tone="ghost" onClick={() => go(item.fix!)}>
                  Erledigen
                </AppButton>
              )}
            </li>
          ))}
        </ul>
        {!open && (
          <div className="nb-onb-ready-action">
            <AppButton tone="primary" onClick={onOpen}>
              Nennung jetzt öffnen
            </AppButton>
            <p className="nb-onb-note">
              Ihr könnt auch mit offenen Punkten öffnen. NENNBOX hält euch nicht
              auf.
            </p>
          </div>
        )}
      </div>
      <div>
        <AppButton tone="ghost" onClick={onReset}>
          Prototyp neu starten
        </AppButton>
      </div>
    </section>
  );
}
