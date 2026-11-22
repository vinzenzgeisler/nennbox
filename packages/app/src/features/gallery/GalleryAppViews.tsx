import { useState } from 'react';
import {
  AppView,
  AppGrid,
  AppSection,
  MetricGrid,
  Metric,
  AppValueRow,
  AppStatusPill,
  AppNotice,
  AppEmptyState,
  AppTextInput,
  AppSelect,
  AppTextarea,
  AppCheckbox,
  AppChoiceGroup,
  AppSettingsGroup,
  OccupancyBar,
  AppTable,
  AppButton,
} from '@nennbox/ui';

/** N4 fields/status and N5 quiet settings, figures, rows and empty states. */
export function GalleryAppViews() {
  const [name, setName] = useState('Fahrzeugschein');
  const [hint, setHint] = useState('Lade alle Seiten hoch.');
  const [required, setRequired] = useState(true);
  const [delimiter, setDelimiter] = useState(';');
  const [saved, setSaved] = useState(false);
  return (
    <AppSection title="App-Design · Übersicht und Einstellungen">
      <AppView>
        <MetricGrid label="Beispiel-Kennzahlen">
          <Metric label="Nennungen" value={128} />
          <Metric
            label="Offene Zahlungen"
            value={12}
            detail="420,00 €"
            tone="attention"
          />
        </MetricGrid>
        <AppGrid columns="two">
          <AppSection title="Status und Belegung">
            <AppValueRow
              label={<AppStatusPill status="zu">Zugelassen</AppStatusPill>}
            >
              42
            </AppValueRow>
            <OccupancyBar
              label="Klasse A"
              occupied={42}
              capacity={60}
              unlimitedLabel="Ohne Limit"
              fullLabel="Voll"
              valueText="42 von 60 belegt"
            />
            <OccupancyBar
              label="Klasse B"
              occupied={20}
              capacity={20}
              unlimitedLabel="Ohne Limit"
              fullLabel="Voll"
              valueText="20 von 20 belegt"
            />
            <OccupancyBar
              label="Klasse C"
              occupied={8}
              capacity={null}
              unlimitedLabel="Ohne Limit"
              fullLabel="Voll"
              valueText="8 belegt, ohne Limit"
            />
          </AppSection>
          <AppSettingsGroup label="Unterlage">
            <AppGrid>
              <AppTextInput
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <AppSelect
                label="Trennzeichen"
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
              >
                <option value=";">Semikolon</option>
                <option value=",">Komma</option>
              </AppSelect>
            </AppGrid>
            <AppTextarea
              label="Hinweis"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
            />
            <AppChoiceGroup label="Spalten">
              <AppCheckbox
                label="Pflichtunterlage"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
            </AppChoiceGroup>
            <AppButton tone="primary" onClick={() => setSaved(true)}>
              Speichern
            </AppButton>
            {saved && <AppNotice tone="success">Gespeichert.</AppNotice>}
          </AppSettingsGroup>
        </AppGrid>
        <AppNotice tone="warning">
          3 Nennungen ohne bestätigte E-Mail-Adresse
        </AppNotice>
        <AppNotice tone="error">
          Export konnte nicht gestartet werden. Versuche es erneut.
        </AppNotice>
        <AppTable headers={['Erstellt', 'Filter', 'Status']}>
          <tr>
            <td>vor 2 Std.</td>
            <td>Alle Nennungen</td>
            <td>
              <AppStatusPill status="zu">Fertig</AppStatusPill>
            </td>
          </tr>
        </AppTable>
        <AppEmptyState
          title="Noch keine Exporte"
          description="Erstelle einen CSV-Export für diese Veranstaltung."
        />
      </AppView>
    </AppSection>
  );
}
