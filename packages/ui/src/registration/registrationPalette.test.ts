import { describe, expect, it } from 'vitest';
import {
  deriveRegistrationPalette,
  registrationContrast,
  registrationPaletteVariables,
} from './registrationPalette.js';
import {
  registrationThemes,
  registrationFixedColors,
  registrationBackgrounds,
  registrationCorners,
} from './registrationThemes.js';

// Literal expected values from tokens/themen.json, not calculated by the port.
const referencePalettes = [
  {
    gewaehlt: '#1F4E79',
    hinweis: 'Blau aus dem Logo',
    angepasst: false,
    rotnah: false,
    werte: {
      '--ak': '#1F4E79',
      '--ak-h': '#0F406A',
      '--ak-a': '#01355E',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#5B8AB9',
      '--ak-fl': '#EDF6FF',
      '--ak-rd': '#CCE3FA',
      '--ak-auf': '#1B4A75',
      '--ak-link': '#3E6C9A',
    },
    messung: {
      textAufBasis: 8.66,
      ringAufWeiss: 3.63,
      textAufFlaeche: 8.42,
      linkAufWeiss: 5.5,
    },
  },
  {
    gewaehlt: '#C0392B',
    hinweis: 'Kräftiges Rot, rotnah',
    angepasst: false,
    rotnah: true,
    werte: {
      '--ak': '#BF382A',
      '--ak-h': '#AD2519',
      '--ak-a': '#A01309',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#DB5342',
      '--ak-fl': '#F7F2F2',
      '--ak-rd': '#E5DCDA',
      '--ak-auf': '#8A0501',
      '--ak-link': '#B83124',
    },
    messung: {
      textAufBasis: 5.51,
      ringAufWeiss: 3.94,
      textAufFlaeche: 9.01,
      linkAufWeiss: 6.0,
    },
  },
  {
    gewaehlt: '#FFD400',
    hinweis: 'Gelb, wird abgedunkelt',
    angepasst: true,
    rotnah: false,
    werte: {
      '--ak': '#846D00',
      '--ak-h': '#735F03',
      '--ak-a': '#665405',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#9F8403',
      '--ak-fl': '#FAF5E1',
      '--ak-rd': '#EBE0B7',
      '--ak-auf': '#564601',
      '--ak-link': '#7D6702',
    },
    messung: {
      textAufBasis: 5.04,
      ringAufWeiss: 3.64,
      textAufFlaeche: 8.46,
      linkAufWeiss: 5.51,
    },
  },
  {
    gewaehlt: '#2E7D32',
    hinweis: 'Grün, nah am Erfolgsgrün',
    angepasst: false,
    rotnah: false,
    werte: {
      '--ak': '#2E7D32',
      '--ak-h': '#1C6E23',
      '--ak-a': '#096216',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#4D9B4F',
      '--ak-fl': '#EAF9EA',
      '--ak-rd': '#CAEAC9',
      '--ak-auf': '#02580F',
      '--ak-link': '#2D7C31',
    },
    messung: {
      textAufBasis: 5.13,
      ringAufWeiss: 3.43,
      textAufFlaeche: 8.0,
      linkAufWeiss: 5.2,
    },
  },
  {
    gewaehlt: '#6B2E2E',
    hinweis: 'Bordeaux, rotnah',
    angepasst: false,
    rotnah: true,
    werte: {
      '--ak': '#6B2E2E',
      '--ak-h': '#5C2021',
      '--ak-a': '#501518',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#B5716E',
      '--ak-fl': '#F5F3F3',
      '--ak-rd': '#E1DDDC',
      '--ak-auf': '#6F3232',
      '--ak-link': '#955352',
    },
    messung: {
      textAufBasis: 10.22,
      ringAufWeiss: 3.78,
      textAufFlaeche: 8.72,
      linkAufWeiss: 5.77,
    },
  },
  {
    gewaehlt: '#0A0A0C',
    hinweis: 'Fast Schwarz, wird aufgehellt',
    angepasst: true,
    rotnah: false,
    werte: {
      '--ak': '#323235',
      '--ak-h': '#262628',
      '--ak-a': '#1D1D1F',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#868689',
      '--ak-fl': '#F4F4F5',
      '--ak-rd': '#DFDFE1',
      '--ak-auf': '#47474A',
      '--ak-link': '#68696B',
    },
    messung: {
      textAufBasis: 12.78,
      ringAufWeiss: 3.63,
      textAufFlaeche: 8.42,
      linkAufWeiss: 5.5,
    },
  },
  {
    gewaehlt: '#193B30',
    hinweis: 'Racing Green, wenn nichts eingestellt ist',
    angepasst: false,
    rotnah: false,
    werte: {
      '--ak': '#193B30',
      '--ak-h': '#0B2E24',
      '--ak-a': '#01241A',
      '--ak-fg': '#FFFFFF',
      '--ak-ring': '#6B8F82',
      '--ak-fl': '#EEF7F3',
      '--ak-rd': '#D3E4DD',
      '--ak-auf': '#2E5044',
      '--ak-link': '#4F7265',
    },
    messung: {
      textAufBasis: 12.28,
      ringAufWeiss: 3.57,
      textAufFlaeche: 8.19,
      linkAufWeiss: 5.35,
    },
  },
] as const;

describe('registration palette derivation', () => {
  it.each(referencePalettes)(
    'matches all nine reference colors for $gewaehlt',
    (fixture) => {
      const result = deriveRegistrationPalette(fixture.gewaehlt);
      expect(registrationPaletteVariables(result)).toEqual(fixture.werte);
      expect(result.adjusted).toBe(fixture.angepasst);
      expect(result.nearErrorRed).toBe(fixture.rotnah);
      expect(result.measurements).toEqual({
        textOnBase: fixture.messung.textAufBasis,
        ringOnWhite: fixture.messung.ringAufWeiss,
        textOnSurface: fixture.messung.textAufFlaeche,
        linkOnWhite: fixture.messung.linkAufWeiss,
      });
    },
  );

  it.each([
    ['#FFD400', '#846D00'],
    ['#0A0A0C', '#323235'],
    ['#E8D5E8', '#796879'],
  ])('applies the light/dark/pastel emergency brake to %s', (raw, base) => {
    const result = deriveRegistrationPalette(raw!);
    expect(result.base).toBe(base);
    expect(result.adjusted).toBe(true);
    expect(result.raw).toBe(raw);
  });

  it.each(['#C0392B', '#6B2E2E', '#E8631A'])(
    'neutralizes red-family selection surfaces for %s',
    (raw) => {
      const result = deriveRegistrationPalette(raw);
      expect(result.nearErrorRed).toBe(true);
      const channels = [1, 3, 5].map((offset) =>
        parseInt(result.surface.slice(offset, offset + 2), 16),
      );
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(
        7,
      );
      expect(result.surface).not.toBe(registrationFixedColors.errorSurface);
    },
  );

  it('does not recolor success or reject a club green close to success', () => {
    const result = deriveRegistrationPalette('#2E7D32');
    expect(result.base).toBe('#2E7D32');
    expect(result.adjusted).toBe(false);
    expect(registrationFixedColors.success).toBe('#2FA866');
  });

  it('measures contrast on final sRGB values for a broad color grid', () => {
    for (const r of [0, 51, 102, 153, 204, 255]) {
      for (const g of [0, 51, 102, 153, 204, 255]) {
        for (const b of [0, 51, 102, 153, 204, 255]) {
          const raw =
            '#' +
            [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
          const p = deriveRegistrationPalette(raw);
          expect(
            registrationContrast(p.foreground, p.base),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            registrationContrast('#FFFFFF', p.base),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            registrationContrast('#FFFFFF', p.hover),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            registrationContrast('#FFFFFF', p.active),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            registrationContrast(p.ring, '#FFFFFF'),
          ).toBeGreaterThanOrEqual(3);
          expect(
            registrationContrast(p.onSurface, p.surface),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            registrationContrast(p.link, '#FFFFFF'),
          ).toBeGreaterThanOrEqual(4.5);
          for (const value of Object.values(registrationPaletteVariables(p))) {
            expect(value).toMatch(/^#[0-9A-F]{6}$/);
          }
        }
      }
    }
  });

  it('handles case-insensitive six-digit inputs and preserves the selected tone', () => {
    expect(deriveRegistrationPalette('#1f4e79')).toEqual({
      ...deriveRegistrationPalette('#1F4E79'),
      raw: '#1f4e79',
    });
  });

  it.each([
    '',
    '#123',
    '#12345678',
    '193B30',
    '#GGGGGG',
    'red',
    '#123456;',
    ' #123456',
  ])('rejects invalid color %s', (value) => {
    expect(() => deriveRegistrationPalette(value)).toThrow(TypeError);
    expect(() => registrationContrast(value, '#FFFFFF')).toThrow(TypeError);
    expect(() => registrationContrast('#FFFFFF', value)).toThrow(TypeError);
  });

  it('implements symmetric WCAG contrast including black and white', () => {
    expect(registrationContrast('#000000', '#FFFFFF')).toBe(21);
    expect(registrationContrast('#193B30', '#193B30')).toBe(1);
    expect(registrationContrast('#193B30', '#FFFFFF')).toBe(
      registrationContrast('#FFFFFF', '#193B30'),
    );
  });

  it('is deterministic and freezes returned colors and measurements', () => {
    const first = deriveRegistrationPalette('#193B30');
    deriveRegistrationPalette('#FFD400');
    expect(first).toEqual(deriveRegistrationPalette('#193B30'));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.measurements)).toBe(true);
    expect(Object.isFrozen(registrationPaletteVariables(first))).toBe(true);
  });

  it('exposes only nine accent variables, without changing fixed neutral or status colors', () => {
    const fixedBefore = { ...registrationFixedColors };
    for (const theme of registrationThemes) {
      const variables = registrationPaletteVariables(
        deriveRegistrationPalette(theme.accent),
      );
      expect(Object.keys(variables).sort()).toEqual(
        [
          '--ak',
          '--ak-a',
          '--ak-fg',
          '--ak-fl',
          '--ak-h',
          '--ak-link',
          '--ak-rd',
          '--ak-ring',
          '--ak-auf',
        ].sort(),
      );
    }
    expect(registrationFixedColors).toEqual(fixedBefore);
    expect(registrationFixedColors).toMatchObject({
      text: '#18201C',
      field: '#FFFFFF',
      border: '#EAEBE8',
      success: '#2FA866',
      warning: '#E07A1F',
      error: '#B42318',
    });
    expect(Object.isFrozen(registrationFixedColors)).toBe(true);
  });

  it('provides the exact four bounded P8 theme presets', () => {
    expect(
      registrationThemes.map((t) => [
        t.name,
        t.header,
        t.accent,
        t.headingFont,
        t.corners,
        t.background,
        t.density,
        t.sponsors,
      ]),
    ).toEqual([
      [
        'Standard',
        'schmal',
        '#193B30',
        'Inter',
        'standard',
        'weiss',
        'normal',
        false,
      ],
      [
        'Traditionsverein',
        'bildband',
        '#6B2E2E',
        'Source Serif 4',
        'kantig',
        'creme',
        'normal',
        true,
      ],
      [
        'Moderner Rennverein',
        'farbband',
        '#0E6B74',
        'Space Grotesk',
        'weich',
        'kuehlgrau',
        'normal',
        false,
      ],
      [
        'Kartclub',
        'grossesLogo',
        '#E8631A',
        'Archivo',
        'kantig',
        'weiss',
        'kompakt',
        true,
      ],
    ]);
    expect(Object.isFrozen(registrationThemes)).toBe(true);
    expect(registrationThemes.every(Object.isFrozen)).toBe(true);
    expect(registrationBackgrounds).toEqual({
      weiss: '#FFFFFF',
      creme: '#FAF7F1',
      kuehlgrau: '#F6F7F8',
      warmgrau: '#F7F6F4',
    });
    expect(registrationCorners).toEqual({
      kantig: [4, 4, 6],
      standard: [8, 10, 12],
      weich: [12, 14, 16],
    });
    expect(Object.values(registrationCorners).every(Object.isFrozen)).toBe(
      true,
    );
  });
});
