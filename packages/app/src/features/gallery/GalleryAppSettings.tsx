import { useState } from 'react';
import {
  AppSettingsLayout,
  AppSettingsNav,
  AppSection,
  AppPreviewCard,
  AppTextInput,
  AppTextarea,
  AppView,
  SegmentedControl,
} from '@nennbox/ui';

export function GalleryAppSettings() {
  const [active, setActive] = useState('gallery-event');
  const [state, setState] = useState('optional');
  return (
    <AppSection title="App-Design · Einrichtung und Hilfe">
      <AppView>
        <AppSettingsLayout
          navigation={
            <AppSettingsNav
              items={[
                { id: 'gallery-event', label: 'Veranstaltung' },
                { id: 'gallery-terms', label: 'Teilnahmebedingungen' },
              ]}
              activeId={active}
              onSelect={setActive}
            />
          }
          aside={
            <AppSection title="Öffentliche Nennung" description="Vorschau">
              <AppPreviewCard>
                <strong>Bergrennen</strong>
                <span>12. Juni 2027</span>
              </AppPreviewCard>
            </AppSection>
          }
        >
          {active === 'gallery-event' ? (
            <AppSection title="Veranstaltung">
              <AppTextInput
                label="Beginn"
                type="date"
                defaultValue="2027-06-12"
                hint="Wähle den ersten Veranstaltungstag."
              />
              <SegmentedControl
                appearance="app"
                label="Telefon"
                options={[
                  { value: 'hidden', label: 'Aus' },
                  { value: 'optional', label: 'Freiwillig' },
                  { value: 'required', label: 'Pflicht' },
                ]}
                value={state}
                onChange={setState}
              />
            </AppSection>
          ) : (
            <AppSection title="Teilnahmebedingungen">
              <AppTextarea
                label="Text der Bedingungen"
                hint="Hinterlege die veröffentlichten Bedingungen."
              />
            </AppSection>
          )}
        </AppSettingsLayout>
      </AppView>
    </AppSection>
  );
}
