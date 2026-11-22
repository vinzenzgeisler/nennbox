import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AppView,
  AppSection,
  AppSettingsLayout,
  AppSettingsNav,
  AppPreviewCard,
  AppNotice as Banner,
  AppEmptyState as EmptyState,
} from '@nennbox/ui';
import type { SetupEvent } from './eventSetupApi.js';
import { loadRecipient } from './eventRecipientApi.js';
import { useEventSetup } from './useEventSetup.js';
import { RegistrationFormSettings } from '../registration/RegistrationFormSettings.js';
import { EventSetupForm } from './EventSetupForm.js';
import { DriverPortalSettings } from './DriverPortalSettings.js';
import { NumberAndWaitlistSettings } from './NumberAndWaitlistSettings.js';
import { validateDraft } from './validateDraft.js';

type SetupView = 'event' | 'fields' | 'portal' | 'numbers';

const sections: Array<{ id: string; label: string; view: SetupView }> = [
  { id: 'event-setup-event', label: 'Veranstaltung', view: 'event' },
  { id: 'event-setup-classes', label: 'Klassen und Startgeld', view: 'event' },
  { id: 'event-setup-terms', label: 'Teilnahmebedingungen', view: 'event' },
  {
    id: 'event-setup-organizer',
    label: 'Veranstalter und Zahlung',
    view: 'event',
  },
  {
    id: 'event-setup-arrival',
    label: 'Anreise und Fahrerlager',
    view: 'event',
  },
  { id: 'event-setup-form-fields', label: 'Formularfelder', view: 'fields' },
  { id: 'event-setup-driver-portal', label: 'Fahrer-Portal', view: 'portal' },
  {
    id: 'event-setup-numbers',
    label: 'Startnummern & Warteliste',
    view: 'numbers',
  },
  { id: 'event-setup-actions', label: 'Nennung öffnen', view: 'event' },
];

export function EventSetup({
  onCreated,
}: {
  onCreated: (event: SetupEvent) => void;
}) {
  const setup = useEventSetup(onCreated);
  const [view, setView] = useState<SetupView>('event');
  const target = useRef('');
  const [activeId, setActiveId] = useState(sections[0]!.id);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (target.current)
      document.getElementById(target.current)?.scrollIntoView();
    target.current = '';
    const revealActive = () => {
      const nav = navRef.current;
      const active = nav?.querySelector<HTMLElement>('a[aria-current="true"]');
      if (nav && active && view !== 'event')
        nav.scrollLeft +=
          active.getBoundingClientRect().left -
          nav.getBoundingClientRect().left -
          8;
    };
    revealActive();
    window.addEventListener('resize', revealActive);
    return () => window.removeEventListener('resize', revealActive);
  }, [view]);
  const { refreshEvents, setDraft } = setup;
  useEffect(() => {
    void refreshEvents().catch(() => undefined);
    void loadRecipient()
      .then(({ recipient }) => {
        if (!recipient) return;
        setDraft((current) =>
          current.accountName || current.iban
            ? current
            : {
                ...current,
                accountName: recipient.accountName,
                recipientAddress: recipient.address ?? '',
                iban: recipient.iban,
                bic: recipient.bic ?? '',
              },
        );
      })
      .catch(() => undefined);
  }, [refreshEvents, setDraft]);

  const submit = (event: FormEvent<HTMLFormElement>, open: boolean) => {
    event.preventDefault();
    if (!validateDraft(event.currentTarget, setup.setMessage)) return;
    void setup.save(event.currentTarget, open);
  };

  return (
    <section
      className={`event-setup${view === 'event' ? '' : ` is-${view}`}`}
      aria-label="Veranstaltung einrichten"
    >
      <AppView>
        <AppSettingsLayout
          navigation={
            <AppSettingsNav
              navRef={navRef}
              items={sections}
              activeId={activeId}
              onSelect={(id) => {
                const section = sections.find((item) => item.id === id)!;
                setActiveId(id);
                if (section.view === view) {
                  document.getElementById(id)?.scrollIntoView();
                  return;
                }
                target.current = id;
                setView(section.view);
              }}
            />
          }
          aside={
            view === 'event' ? (
              <>
                <AppSection title="Vor dem Öffnen" description="Hilfe">
                  <p>
                    Mindestens eine offene Klasse braucht ein Startgeld.
                    Hinterlege veröffentlichte Teilnahmebedingungen, bevor du
                    die Nennung freischaltest.
                  </p>
                  <p>
                    Das Startgeld dokumentiert den Preis; es löst keine
                    Online-Zahlung aus.
                  </p>
                </AppSection>
                <AppSection title="Öffentliche Nennung" description="Vorschau">
                  <AppPreviewCard>
                    <strong>
                      {setup.draft.name || 'Name der Veranstaltung'}
                    </strong>
                    <span>
                      {setup.draft.startsOn || 'Beginn'}
                      {setup.draft.endsOn ? ` – ${setup.draft.endsOn}` : ''}
                    </span>
                    <span>
                      {setup.draft.classes.length} Klasse
                      {setup.draft.classes.length === 1 ? '' : 'n'}
                    </span>
                    {setup.draft.classes.slice(0, 3).map((item, index) => (
                      <span key={item.id ?? `${item.code}-${index}`}>
                        {item.name || 'Klassenname'} · {item.fee || '0,00'} €
                      </span>
                    ))}
                    {setup.draft.classes.length > 3 && (
                      <span>+ {setup.draft.classes.length - 3} weitere</span>
                    )}
                  </AppPreviewCard>
                  <p>
                    Die Vorschau zeigt die wichtigsten Angaben vor dem
                    Veröffentlichen.
                  </p>
                </AppSection>
              </>
            ) : undefined
          }
        >
          <div className="nb-app-stack">
            <div className="nb-app-stack" hidden={view !== 'event'}>
              <p>
                Veranstaltungsdaten, Klassen und Teilnahmebedingungen an einem
                Ort einrichten. Vor dem Öffnen prüfen wir die Pflichtangaben.
              </p>
              <EventSetupForm
                draft={setup.draft}
                setDraft={setup.setDraft}
                events={setup.events}
                busy={setup.busy}
                onResume={(id) =>
                  void setup.resume(id).catch((error: unknown) => {
                    setup.setMessage(
                      error instanceof Error
                        ? error.message
                        : 'Entwurf konnte nicht geladen werden.',
                    );
                  })
                }
                onReset={setup.reset}
                onClearRecipient={setup.clearRecipient}
                onSubmit={submit}
              />
              {setup.message && (
                <Banner tone={setup.link ? 'success' : 'warning'}>
                  {setup.message}
                </Banner>
              )}
              {setup.link && (
                <p className="nb-app-wrap">
                  Öffentliche Nennung:{' '}
                  <a href={setup.link} target="_blank" rel="noreferrer">
                    {setup.link}
                  </a>
                </p>
              )}
            </div>
            {view === 'portal' && (
              <section id="event-setup-driver-portal">
                {setup.draft.id ? (
                  <DriverPortalSettings
                    key={setup.draft.id}
                    eventId={setup.draft.id}
                    slug={setup.draft.slug}
                  />
                ) : (
                  <EmptyState
                    title="Fahrer-Portal"
                    description="Speichere die Veranstaltung zuerst als Entwurf, dann legst du die korrigierbaren Felder fest."
                  />
                )}
              </section>
            )}
            {view === 'fields' && (
              <section id="event-setup-form-fields">
                {setup.draft.id ? (
                  <RegistrationFormSettings
                    key={setup.draft.id}
                    eventId={setup.draft.id}
                    embedded
                  />
                ) : (
                  <EmptyState
                    title="Formularfelder"
                    description="Speichere die Veranstaltung zuerst als Entwurf, dann legst du hier die Formularfelder fest."
                  />
                )}
              </section>
            )}
            {view === 'numbers' && (
              <section id="event-setup-numbers">
                {setup.draft.id ? (
                  <NumberAndWaitlistSettings
                    key={setup.draft.id}
                    eventId={setup.draft.id}
                  />
                ) : (
                  <EmptyState
                    title="Startnummern & Warteliste"
                    description="Speichere die Veranstaltung zuerst als Entwurf, dann legst du hier Nummernbereiche und die Warteliste fest."
                  />
                )}
              </section>
            )}
          </div>
        </AppSettingsLayout>
      </AppView>
    </section>
  );
}
