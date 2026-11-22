import type { ChangeEvent } from 'react';
import {
  AppTextInput,
  AppFileInput,
  AppSection,
  AppSelect,
  AppGrid,
  AppTextarea,
} from '@nennbox/ui';
import type { RegistrationFormConfig } from '@nennbox/contracts';

type UpdateConfig = (
  updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
) => void;
type ChangeConfig = (patch: Partial<RegistrationFormConfig>) => void;

export function RegistrationAppearance({
  activeConfig,
  updateConfig,
  change,
  upload,
}: {
  activeConfig: RegistrationFormConfig;
  updateConfig: UpdateConfig;
  change: ChangeConfig;
  upload: (
    kind: 'logoLight' | 'logoDark' | 'headerImage',
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
}) {
  return (
    <>
      <AppSection title="Erscheinungsbild">
        <AppGrid>
          <AppTextInput
            label="Primärfarbe"
            type="color"
            value={activeConfig.branding.primaryColor}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  primaryColor: e.target.value.toUpperCase(),
                },
              }))
            }
          />
          <AppTextInput
            label="Akzentfarbe"
            type="color"
            value={activeConfig.branding.accentColor}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  accentColor: e.target.value.toUpperCase(),
                },
              }))
            }
          />
          <AppSelect
            label="Ecken"
            value={activeConfig.branding.corners}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  corners: e.target.value as 'square' | 'rounded',
                },
              }))
            }
          >
            <option value="square">Eckig</option>
            <option value="rounded">Leicht gerundet · 6 px</option>
          </AppSelect>
          <AppSelect
            label="Überschriftenschrift"
            value={activeConfig.branding.headingFont}
            disabled
          >
            <option value="archivo">Archivo · Brandbook M4</option>
          </AppSelect>
          <AppFileInput
            label="Logo auf hellem Grund"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoLight', e)}
          />
          <AppFileInput
            label="Logo auf dunklem Grund"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoDark', e)}
          />
          <AppFileInput
            label="Kopfbild · optional"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload('headerImage', e)}
          />
        </AppGrid>
      </AppSection>
      <AppTextarea
        label="Begrüßung"
        maxLength={4000}
        value={activeConfig.welcomeText}
        onChange={(e) => change({ welcomeText: e.target.value })}
      />
      <AppTextarea
        label="Hinweise des Veranstalters"
        maxLength={10000}
        value={activeConfig.organizerNotice}
        onChange={(e) => change({ organizerNotice: e.target.value })}
      />
    </>
  );
}
