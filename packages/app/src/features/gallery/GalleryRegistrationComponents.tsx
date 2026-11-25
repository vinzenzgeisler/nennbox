import { useState } from 'react';
import {
  AppButton,
  RegistrationCard,
  RegistrationField,
  RegistrationNotice,
  RegistrationUpload,
  deriveRegistrationPalette,
  registrationPaletteVariables,
} from '@nennbox/ui';
import type { CSSProperties } from 'react';

export function GalleryRegistrationComponents() {
  const [value, setValue] = useState('Porsche');
  return (
    <section
      className="nb-reg"
      style={
        registrationPaletteVariables(
          deriveRegistrationPalette('#1F4E79'),
        ) as CSSProperties
      }
    >
      <h2>Nennformular (Prototyp)</h2>
      <p>
        <a href="/app/registration-preview">
          Lokalen Nennformular-Prototyp öffnen (Entwicklungsbuild)
        </a>
      </p>
      <div className="nb-gallery-grid">
        <RegistrationField
          label="Hersteller"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <RegistrationField
          label="Transponder-Nr."
          placeholder="Bitte eintragen"
        />
        <RegistrationField
          label="E-Mail-Adresse"
          error="Bitte gib eine gültige E-Mail-Adresse ein."
          defaultValue="tom@beispiel"
        />
        <RegistrationField
          label="Startgeld"
          readOnly
          value="110,00 €"
          hint="Ergibt sich aus der Klasse."
        />
      </div>
      <RegistrationCard title="Startmeldung 1" action={<strong>110 €</strong>}>
        <p>Serienwagen über 1600 cm³</p>
        <RegistrationCard title="Ersatzfahrzeug" inset>
          <p>zählt nicht als Startmeldung · 0 €</p>
        </RegistrationCard>
      </RegistrationCard>
      <RegistrationNotice>
        Dein Beifahrer ergänzt seine Daten selbst.
      </RegistrationNotice>
      <RegistrationNotice tone="warning">
        Rennwagen ist ausgebucht. Du kannst auf die Warteliste.
      </RegistrationNotice>
      <RegistrationNotice tone="error">
        Bitte prüfe deine Angaben und versuche es erneut.
      </RegistrationNotice>
      <RegistrationNotice tone="success">
        Lizenz lokal bereit.
      </RegistrationNotice>
      <RegistrationUpload
        label="Fahrzeugpass"
        required
        onSelect={() => undefined}
      />
      <RegistrationUpload
        label="Lizenz"
        state="success"
        detail="lizenz.jpg · 1,4 MB"
      />
      <RegistrationUpload
        label="Fahrzeugschein"
        state="uploading"
        progress={45}
      />
      <RegistrationUpload
        label="Sonstiger Nachweis"
        state="error"
        error="Lade eine Datei als PDF, JPG oder PNG hoch."
      />
      <AppButton>Weiter</AppButton>
    </section>
  );
}
