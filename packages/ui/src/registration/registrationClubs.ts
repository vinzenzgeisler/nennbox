import {
  registrationContrast,
  type RegistrationHex,
  type RegistrationPalette,
} from './registrationPalette.js';

/** Example clubs of P7/P8. Only a logo/initials tile and one accent differ. */
export interface RegistrationClub {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly accent: RegistrationHex;
}

export const registrationClubs: readonly RegistrationClub[] = Object.freeze(
  [
    ['msc', 'MSC Hohenstein e. V.', 'MSC', '#1F4E79'],
    ['amc', 'AMC Rotwand', 'AMC', '#C0392B'],
    ['kcs-gelb', 'Kart Club Sonne', 'KCS', '#FFD400'],
    ['msc-gruen', 'MSC Waldgrün', 'MSC', '#2E7D32'],
    ['rsn-dunkel', 'Rennsport Nord', 'RSN', '#0A0A0C'],
    ['nennbox', 'Standard · NENNBOX', 'NB', '#193B30'],
    ['oft', 'Oldtimer Freunde Taunus', 'OF', '#6B2E2E'],
    ['rn', 'Rennsport Nord e. V.', 'RN', '#0E6B74'],
    ['kcs', 'Kart Club Sonne', 'KCS', '#E8631A'],
  ].map(([id, name, initials, accent]) =>
    Object.freeze({
      id,
      name,
      initials,
      accent,
    } as RegistrationClub),
  ),
);

/** P7 "Die Probe": the same form with a neutral grey accent must stay usable. */
export const registrationNeutralAccent = '#5A605C' as const;

export type RegistrationAccentNotice = 'darkened' | 'lightened' | 'nearSuccess';

// OKLab distance below which a club accent is hard to tell from success green.
const NEAR_SUCCESS_DISTANCE = 0.15;
const SUCCESS = '#2FA866';

function oklab(hex: string): readonly [number, number, number] {
  const lin = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)] as const;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * What NENNBOX tells the club about its accent (P7). The accent is never
 * blocked: darkened/lightened tones are applied, near-success only warns.
 */
export function registrationAccentNotice(
  palette: RegistrationPalette,
): RegistrationAccentNotice | null {
  if (palette.adjusted) {
    return registrationContrast('#FFFFFF', palette.base) <
      registrationContrast('#FFFFFF', palette.raw)
      ? 'lightened'
      : 'darkened';
  }
  const a = oklab(palette.base);
  const b = oklab(SUCCESS);
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return distance < NEAR_SUCCESS_DISTANCE ? 'nearSuccess' : null;
}
