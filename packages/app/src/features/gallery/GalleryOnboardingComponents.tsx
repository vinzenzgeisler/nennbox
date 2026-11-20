import { useState } from 'react';
import {
  ChoiceCard,
  ChoiceGroup,
  LivePreview,
  OnboardingProgress,
  OnboardingSketch,
  Slider,
  sketchNames,
} from '@nennbox/ui';

export function GalleryOnboardingComponents() {
  const [single, setSingle] = useState('b');
  const [multi, setMulti] = useState<string[]>(['a']);
  const [value, setValue] = useState(120);
  const [view, setView] = useState('form');
  const toggle = (id: string, on: boolean) =>
    setMulti(on ? [...multi, id] : multi.filter((item) => item !== id));
  return (
    <section className="nb-gallery-onboarding">
      <h2>Einrichtung (Onboarding)</h2>
      <h3>Entscheidungskarten, Einfachauswahl</h3>
      <ChoiceGroup aria-label="Einfachauswahl">
        {(['a', 'b', 'c'] as const).map((id, index) => (
          <ChoiceCard
            key={id}
            value={id}
            checked={single === id}
            onChange={() => setSingle(id)}
            title={['Bergrennen', 'Rallye', 'Slalom'][index]!}
            description="Ein Satz Erklärung, der die Entscheidung erleichtert."
            illustration={
              <OnboardingSketch
                name={(['hillclimb', 'rally', 'slalom'] as const)[index]!}
              />
            }
            badge={id === 'b' ? 'Empfohlen' : undefined}
            exampleLabel="Beispiel"
            example="Ein konkretes Beispiel aus dem Vereinsalltag."
          />
        ))}
      </ChoiceGroup>
      <h3>Mehrfachauswahl, Zeilenansicht</h3>
      <ChoiceGroup
        mode="multiple"
        layout="rows"
        columns={2}
        aria-label="Mehrfachauswahl"
      >
        {(['a', 'b'] as const).map((id) => (
          <ChoiceCard
            key={id}
            value={id}
            checked={multi.includes(id)}
            onChange={(on) => toggle(id, on)}
            title={id === 'a' ? 'Warteliste' : 'Beifahrer'}
            description="Mehrere Karten können gleichzeitig gewählt sein."
            illustration={
              <OnboardingSketch name={id === 'a' ? 'waitlist' : 'codriver'} />
            }
          />
        ))}
      </ChoiceGroup>
      <h3>Regler</h3>
      <Slider
        label="Erwartete Starter"
        value={value}
        min={10}
        max={400}
        step={5}
        onChange={setValue}
        minLabel="10"
        maxLabel="400"
      />
      <h3>Fortschritt</h3>
      <OnboardingProgress
        label="Fortschritt"
        position="Schritt 4 von 15 · Veranstaltung"
        completedLabel="erledigt"
        current={2}
        segments={[
          'Konto',
          'Verein',
          'Veranstaltung',
          'Details',
          'Klassen',
          'Termin',
          'Fertig',
        ].map((label, index) => ({
          label,
          fill: index < 2 ? 1 : index === 2 ? 0.5 : 0,
        }))}
      />
      <h3>Rahmen der Live-Vorschau</h3>
      <LivePreview
        label="Vorschau"
        title="Vorschau"
        statusLabel="Live"
        viewsLabel="Ansicht"
        views={[
          { value: 'form', label: 'Nennformular' },
          { value: 'event', label: 'Veranstaltungsseite' },
        ]}
        view={view}
        onViewChange={setView}
        address="verein.nennbox.com/events/beispiel"
      >
        <p className="nb-gallery-onboarding-note">
          Inhalt der Seite, die der Verein gerade baut.
        </p>
      </LivePreview>
      <h3>Skizzen</h3>
      <ul className="nb-gallery-sketches">
        {sketchNames.map((name) => (
          <li key={name}>
            <OnboardingSketch name={name} />
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
