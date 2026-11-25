import type { RegistrationHex } from './registrationPalette.js';

/** The four bounded example themes in tokens/themen.json (P8). */
export interface RegistrationTheme {
  readonly id: string;
  readonly name: string;
  readonly header: 'schmal' | 'farbband' | 'bildband' | 'grossesLogo';
  readonly accent: RegistrationHex;
  readonly headingFont:
    'Inter' | 'Archivo' | 'Space Grotesk' | 'Source Serif 4';
  readonly corners: 'kantig' | 'standard' | 'weich';
  readonly background: 'weiss' | 'creme' | 'kuehlgrau' | 'warmgrau';
  readonly density: 'normal' | 'kompakt';
  readonly sponsors: boolean;
}

export const registrationThemes: readonly RegistrationTheme[] = Object.freeze([
  Object.freeze({
    id: 'standard',
    name: 'Standard',
    header: 'schmal',
    accent: '#193B30',
    headingFont: 'Inter',
    corners: 'standard',
    background: 'weiss',
    density: 'normal',
    sponsors: false,
  } as const),
  Object.freeze({
    id: 'tradition',
    name: 'Traditionsverein',
    header: 'bildband',
    accent: '#6B2E2E',
    headingFont: 'Source Serif 4',
    corners: 'kantig',
    background: 'creme',
    density: 'normal',
    sponsors: true,
  } as const),
  Object.freeze({
    id: 'modern',
    name: 'Moderner Rennverein',
    header: 'farbband',
    accent: '#0E6B74',
    headingFont: 'Space Grotesk',
    corners: 'weich',
    background: 'kuehlgrau',
    density: 'normal',
    sponsors: false,
  } as const),
  Object.freeze({
    id: 'kart',
    name: 'Kartclub',
    header: 'grossesLogo',
    accent: '#E8631A',
    headingFont: 'Archivo',
    corners: 'kantig',
    background: 'weiss',
    density: 'kompakt',
    sponsors: true,
  } as const),
]);

export const registrationBackgrounds = Object.freeze({
  weiss: '#FFFFFF',
  creme: '#FAF7F1',
  kuehlgrau: '#F6F7F8',
  warmgrau: '#F7F6F4',
} as const);

/** Field, card, box radii; compact density never shrinks the 44 px hit target. */
export const registrationCorners = Object.freeze({
  kantig: Object.freeze([4, 4, 6] as const),
  standard: Object.freeze([8, 10, 12] as const),
  weich: Object.freeze([12, 14, 16] as const),
});

/** Fixed tokens are deliberately separate from the accent-only variable map. */
export const registrationFixedColors = Object.freeze({
  text: '#18201C',
  textSecondary: '#454D48',
  textMuted: '#6E7570',
  field: '#FFFFFF',
  border: '#EAEBE8',
  borderStrong: '#DCDEDA',
  success: '#2FA866',
  successText: '#156339',
  warning: '#E07A1F',
  warningText: '#B45309',
  warningSurface: '#FDF3EA',
  error: '#B42318',
  errorSurface: '#FCECE9',
} as const);
