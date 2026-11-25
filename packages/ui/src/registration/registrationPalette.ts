/**
 * Pure TypeScript port of the supplied akzent-ableitung.js specification.
 * Only accent tokens vary: neutral text/fields/borders and status colors do not.
 */
export type RegistrationHex = `#${string}`;
type Triple = readonly [number, number, number];

export interface RegistrationPalette {
  readonly raw: RegistrationHex;
  readonly base: RegistrationHex;
  readonly foreground: RegistrationHex;
  readonly hover: RegistrationHex;
  readonly active: RegistrationHex;
  readonly ring: RegistrationHex;
  readonly surface: RegistrationHex;
  readonly border: RegistrationHex;
  readonly onSurface: RegistrationHex;
  readonly link: RegistrationHex;
  readonly nearErrorRed: boolean;
  readonly adjusted: boolean;
  readonly measurements: Readonly<{
    textOnBase: number;
    ringOnWhite: number;
    textOnSurface: number;
    linkOnWhite: number;
  }>;
}

const WHITE = '#FFFFFF';
const DARK = '#18201C';

function validateHex(value: string): asserts value is RegistrationHex {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError('Expected a six-digit hex color (#RRGGBB).');
  }
}

function hexToRgb(hex: string): Triple {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function rgbToHex(rgb: Triple): RegistrationHex {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)))
      .toString(16)
      .toUpperCase()
      .padStart(2, '0');
  return `#${rgb.map(channel).join('')}`;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

function hexToLch(hex: string): Triple {
  const [r, g, b] = hexToRgb(hex);
  const R = toLinear(r),
    G = toLinear(g),
    B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [
    L,
    Math.hypot(a, bb),
    ((((Math.atan2(bb, a) * 180) / Math.PI) % 360) + 360) % 360,
  ];
}

function labToRgb(L: number, a: number, b: number): Triple {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function lchToHex(L: number, C: number, H: number): RegistrationHex {
  const rad = (H * Math.PI) / 180;
  for (let i = 0; i < 80; i++) {
    const c = C * (1 - i * 0.0125);
    const rgb = labToRgb(L, c * Math.cos(rad), c * Math.sin(rad));
    if (Math.min(...rgb) >= -0.001 && Math.max(...rgb) <= 1.001)
      return rgbToHex(rgb);
  }
  return rgbToHex(labToRgb(L, 0, 0));
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG relative-luminance contrast, measured on the final quantized sRGB hex. */
export function registrationContrast(a: string, b: string): number {
  validateHex(a);
  validateHex(b);
  const la = luminance(a),
    lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function contrastingTone(
  L: number,
  C: number,
  H: number,
  background: string,
  minimum: number,
): RegistrationHex {
  for (let i = 0; i < 70; i++) {
    const tone = lchToHex(L - i * 0.006, C, H);
    if (registrationContrast(tone, background) >= minimum) return tone;
  }
  // Fail closed rather than emitting an unchecked color if targets ever change.
  throw new Error('Unable to derive a contrast-safe registration accent.');
}

export function deriveRegistrationPalette(raw: string): RegistrationPalette {
  validateHex(raw);
  const [L, C, H] = hexToLch(raw);
  let baseLightness = Math.min(Math.max(L, 0.32), 0.54);
  let base = lchToHex(baseLightness, C, H);
  if (registrationContrast(WHITE, base) < 4.5) {
    for (let i = 0; i < 60; i++) {
      const tone = lchToHex(baseLightness - i * 0.005, C, H);
      if (registrationContrast(WHITE, tone) >= 4.5) {
        base = tone;
        baseLightness -= i * 0.005;
        break;
      }
    }
  }
  const foreground =
    registrationContrast(WHITE, base) >= registrationContrast(DARK, base)
      ? WHITE
      : DARK;
  const distance = Math.abs(H - 32) % 360;
  const nearErrorRed = Math.min(distance, 360 - distance) < 28;
  const surface = nearErrorRed
    ? lchToHex(0.966, Math.min(C * 0.03, 0.006), H)
    : lchToHex(0.968, Math.min(C * 0.22, 0.026), H);
  const border = nearErrorRed
    ? lchToHex(0.9, Math.min(C * 0.06, 0.013), H)
    : lchToHex(0.905, Math.min(C * 0.45, 0.055), H);
  const ring = contrastingTone(0.62, C, H, WHITE, 3);
  const onSurface = contrastingTone(0.4, C, H, surface, 4.5);
  const link = contrastingTone(0.52, C, H, WHITE, 4.5);
  const measured = (a: string, b: string) =>
    +registrationContrast(a, b).toFixed(2);

  return Object.freeze({
    raw,
    base,
    foreground,
    hover: lchToHex(Math.max(baseLightness - 0.05, 0.14), C, H),
    active: lchToHex(Math.max(baseLightness - 0.09, 0.11), C, H),
    ring,
    surface,
    border,
    onSurface,
    link,
    nearErrorRed,
    adjusted:
      Math.abs(baseLightness - L) > 0.012 ||
      registrationContrast(WHITE, raw) < 4.5,
    measurements: Object.freeze({
      textOnBase: measured(foreground, base),
      ringOnWhite: measured(WHITE, ring),
      textOnSurface: measured(onSurface, surface),
      linkOnWhite: measured(link, WHITE),
    }),
  });
}

/** Apply these tokens on a form wrapper, never on the global application root. */
export function registrationPaletteVariables(palette: RegistrationPalette) {
  return Object.freeze({
    '--ak': palette.base,
    '--ak-h': palette.hover,
    '--ak-a': palette.active,
    '--ak-fg': palette.foreground,
    '--ak-ring': palette.ring,
    '--ak-fl': palette.surface,
    '--ak-rd': palette.border,
    '--ak-auf': palette.onSurface,
    '--ak-link': palette.link,
  });
}
