import { useState } from 'react';
import {
  ChoiceCard,
  ChoiceGroup,
  EmergingList,
  NumberStepper,
  OnboardingField,
  OnboardingIcon,
  OnboardingSections,
  OnboardingSwitch,
  OnboardingTextarea,
  StepActions,
} from '@nennbox/ui';
import { icons } from '../onboarding/icons.js';

const states = [
  { id: 'rest', title: 'Ruhe' },
  { id: 'recommended', title: 'Empfohlen', badge: 'Empfohlen' },
  { id: 'chosen', title: 'Gewählt', checked: true },
  { id: 'locked', title: 'Immer dabei', lockedLabel: 'Hauptsprache' },
  {
    id: 'unavailable',
    title: 'Nicht möglich',
    reason: 'Passt nicht zu Fahrzeugpass und Baujahr',
  },
] as const;

/** Building blocks of the guided setup (#201), shown in all states of the reference. */
export function GalleryOnboardingComponents() {
  const [chosen, setChosen] = useState('b');
  const [on, setOn] = useState(true);
  const [year, setYear] = useState(1990);
  return (
    <section className="nb-gallery-onboarding nb-app-design">
      <h2>Einrichtung (Onboarding)</h2>
      <h3>
        Auswahlkarte, alle Zustände (Hover und Tastaturfokus am Rechner prüfen)
      </h3>
      <ChoiceGroup aria-label="Zustände der Auswahlkarte" columns={3}>
        {states.map((item) => (
          <ChoiceCard
            key={item.id}
            value={item.id}
            checked={'checked' in item}
            lockedLabel={'lockedLabel' in item ? item.lockedLabel : undefined}
            onChange={() => undefined}
            title={item.title}
            description="Ein Satz, der die Art erklärt."
            illustration={<OnboardingIcon path={icons.hillclimb} />}
            consequence="Folge für Formular, Klassen oder Unterlagen"
            badge={'badge' in item ? item.badge : undefined}
            unavailableReason={'reason' in item ? item.reason : undefined}
          />
        ))}
      </ChoiceGroup>
      <h3>Auswahlkarte, bedienbar (Zifferntasten 1–9 gelten im Frageschirm)</h3>
      <ChoiceGroup aria-label="Einfachauswahl" columns={3}>
        {['a', 'b', 'c'].map((id, index) => (
          <ChoiceCard
            key={id}
            value={id}
            checked={chosen === id}
            onChange={() => setChosen(id)}
            title={['Bergrennen', 'Rallye', 'Slalom'][index]!}
            description="Ein Satz Erklärung, der die Entscheidung erleichtert."
            illustration={
              <OnboardingIcon
                path={
                  icons[(['hillclimb', 'rally', 'slalom'] as const)[index]!]
                }
              />
            }
            consequence="4 Klassen nach Hubraum, Nummern 1 bis 199"
            badge={id === 'a' ? 'Empfohlen' : undefined}
          />
        ))}
      </ChoiceGroup>
      <h3>Abschnittsleiste</h3>
      <div className="nb-gallery-onboarding-frame">
        <OnboardingSections
          label="Abschnitte"
          doneLabel="erledigt"
          onSelect={() => undefined}
          note={{
            title: 'Noch etwa acht Minuten',
            text: 'Du kannst jederzeit aufhören. Angefangenes bleibt gespeichert.',
          }}
          sections={[
            { id: 'a', label: 'Konto', state: 'done' },
            { id: 'b', label: 'Verein', state: 'done' },
            {
              id: 'c',
              label: 'Veranstaltung',
              state: 'active',
              screens: [{ label: 'Was veranstaltet ihr', state: 'active' }],
            },
            { id: 'd', label: 'Teilnehmer', state: 'todo' },
            { id: 'e', label: 'Nennung', state: 'todo' },
          ]}
        />
      </div>
      <h3>Das entsteht (breite Spalte, am Handy eine Leiste)</h3>
      <div className="nb-gallery-onboarding-frame">
        <EmergingList
          title="Das entsteht"
          openLabel="noch offen"
          closeLabel="Schließen"
          footnote="Alles hier lässt sich nach dem Einrichten ändern."
          groups={[
            {
              id: 'event',
              title: 'Eure Veranstaltung',
              rows: [
                {
                  kind: 'fact',
                  id: 'k',
                  label: 'Art',
                  value: 'Bergrennen',
                  signature: 'a',
                },
                {
                  kind: 'fact',
                  id: 'n',
                  label: 'Nummern',
                  value: '1 bis 199',
                  derived: true,
                  derivedLabel: 'abgeleitet',
                  signature: 'b',
                },
                {
                  kind: 'fact',
                  id: 't',
                  label: 'Termin',
                  value: null,
                  signature: 'c',
                },
              ],
            },
            {
              id: 'form',
              title: 'Das fragt das Nennformular',
              rows: [
                {
                  kind: 'field',
                  id: 'l',
                  name: 'Lizenznummer',
                  tag: 'Pflicht',
                  tone: 'required',
                  reason: 'Weil nur Lizenzfahrer starten',
                  signature: 'a',
                },
                {
                  kind: 'field',
                  id: 'w',
                  name: 'Wunschnummer',
                  tag: 'Freiwillig',
                  tone: 'optional',
                  reason: 'Ihr gebt sie frei',
                  signature: 'b',
                },
                {
                  kind: 'field',
                  id: 'p',
                  name: 'Fahrzeugpass',
                  tag: 'Datei',
                  tone: 'file',
                  reason: 'Für historische Fahrzeuge',
                  signature: 'c',
                },
                {
                  kind: 'field',
                  id: 'x',
                  name: 'Transpondernummer',
                  tag: 'Abgeschaltet',
                  tone: 'off',
                  reason: 'Nur bei elektronischer Zeitnahme',
                  signature: 'd',
                },
              ],
            },
          ]}
        />
      </div>
      <h3>Fußleiste</h3>
      <StepActions
        backLabel="Zurück"
        onBack={() => undefined}
        skipLabel="Überspringen"
        skipHint="Wir nehmen den Vorschlag"
        onSkip={() => undefined}
        continueLabel="Weiter"
        onContinue={() => undefined}
        hints={['↵ weiter', '1–9 wählen']}
      />
      <StepActions
        backLabel="Zurück"
        onBack={() => undefined}
        continueLabel="Weiter"
        onContinue={() => undefined}
        continueDisabled
        hints={['1–9 wählen']}
      />
      <h3>Eingaben</h3>
      <div className="nb-gallery-onboarding-fields">
        <OnboardingField
          label="Adresse"
          defaultValue="msc-hohenstein"
          suffix=".nennbox.com"
          success="Adresse ist frei"
        />
        <OnboardingField
          label="Adresse"
          defaultValue="msc"
          suffix=".nennbox.com"
          error="Diese Adresse ist schon vergeben."
        />
        <NumberStepper
          label="Historisch bis Baujahr"
          hint="Jüngere Fahrzeuge brauchen keinen Fahrzeugpass."
          value={year}
          min={1930}
          max={2005}
          step={5}
          lessLabel="Früher"
          moreLabel="Später"
          onChange={setYear}
        />
        <OnboardingSwitch
          label="Warteliste aktivieren"
          hint="Sagt jemand ab, rückt ihr den Nächsten nach."
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
        />
        <OnboardingTextarea
          label="Teilnahmebedingungen"
          defaultValue="Mustertext"
          rows={3}
        />
      </div>
    </section>
  );
}
