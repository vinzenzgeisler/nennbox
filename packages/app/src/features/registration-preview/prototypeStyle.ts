import type { CSSProperties } from 'react';
import {
  registrationPaletteVariables,
  registrationBackgrounds,
  registrationCorners,
  type RegistrationTheme,
  type RegistrationPalette,
} from '@nennbox/ui';
export function prototypeStyle(
  theme: RegistrationTheme,
  palette: RegistrationPalette,
): CSSProperties {
  const radii = registrationCorners[theme.corners];
  return {
    ...registrationPaletteVariables(palette),
    '--preview-background': registrationBackgrounds[theme.background],
    '--preview-heading':
      theme.headingFont === 'Source Serif 4'
        ? "'Source Serif 4', Georgia, serif"
        : `'${theme.headingFont}', Inter, sans-serif`,
    '--preview-field-radius': `${radii[0]}px`,
    '--preview-card-radius': `${radii[1]}px`,
    '--preview-space': theme.density === 'kompakt' ? '10px' : '14px',
  } as CSSProperties;
}
