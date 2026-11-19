import { deriveAccessibleBrandColors } from '../branding.js';

const umlauts: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};
const legalForms = /\b(?:e\.?\s?v\.?|ev|e\.?\s?k\.?|gmbh|ug|verein)\b/gi;

function slugify(text: string, max: number): string {
  return text
    .toLowerCase()
    .replace(legalForms, ' ')
    .replace(/[äöüß]/g, (letter) => umlauts[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** `https://<slug>.nennbox.com` address proposed from a club name. */
export const slugifyClubName = (name: string) => slugify(name, 30);

export const reservedSubdomains = [
  'www',
  'app',
  'api',
  'admin',
  'auth',
  'mail',
  'status',
  'support',
  'nennbox',
  'dev',
  'demo',
] as const;

export type SubdomainCheck =
  | { status: 'empty' | 'invalid' | 'reserved' }
  | { status: 'taken'; alternative: string }
  | { status: 'available' };

/** Address check; `taken` is what the registry reported (the prototype uses sample data). */
export function checkSubdomain(
  slug: string,
  taken: readonly string[] = [],
): SubdomainCheck {
  if (!slug) return { status: 'empty' };
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug))
    return { status: 'invalid' };
  if ((reservedSubdomains as readonly string[]).includes(slug))
    return { status: 'reserved' };
  if (taken.includes(slug)) {
    let counter = 2;
    while (taken.includes(`${slug}-${counter}`)) counter++;
    return { status: 'taken', alternative: `${slug}-${counter}` };
  }
  return { status: 'available' };
}

export const defaultBrandPalette = { primary: '#193B30', accent: '#B5E0CA' };

export interface BrandPalette {
  primary: string;
  accent: string;
  /** True when a colour had to be darkened to keep text readable on it. */
  adjusted: boolean;
}

const channels = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((part) => parseInt(part, 16));

function saturation(hex: string) {
  const [r, g, b] = channels(hex).map((value) => value / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
const brightness = (hex: string) => {
  const [r, g, b] = channels(hex) as [number, number, number];
  return (r * 299 + g * 587 + b * 114) / 255000;
};

/**
 * Up to three palettes from colours sampled in an uploaded logo. Near-white and grey
 * samples are ignored; the first palette pairs the two most characteristic colours.
 * Without usable samples the NENNBOX default is the only suggestion.
 */
export function suggestBrandColors(samples: readonly string[]): BrandPalette[] {
  const usable = [
    ...new Set(
      samples.filter((color) => /^#[\da-f]{6}$/i.test(color)).map(upper),
    ),
  ].filter((color) => saturation(color) >= 0.25 && brightness(color) <= 0.92);
  if (usable.length === 0)
    return [paletteOf(defaultBrandPalette.primary, defaultBrandPalette.accent)];
  const [first, second, third] = usable as [string, string?, string?];
  const pairs: Array<[string, string]> = [
    [first, second ?? defaultBrandPalette.accent],
  ];
  if (second && third) pairs.push([second, third], [first, third]);
  if (!second) pairs.push([first, defaultBrandPalette.primary]);
  return pairs
    .slice(0, 3)
    .map(([primary, accent]) => paletteOf(primary, accent));
}
const upper = (color: string) => color.toUpperCase();
function paletteOf(primary: string, accent: string): BrandPalette {
  const derived = deriveAccessibleBrandColors(primary, accent);
  return {
    primary: derived.primarySurface,
    accent: derived.accentSurface,
    adjusted: derived.contrastNotice,
  };
}

const dayMs = 86_400_000;
const parseDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const isIsoDay = (value: string | null | undefined): value is string =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  isoDay(parseDay(value)) === value;

export function addDays(iso: string, days: number): string {
  return isoDay(parseDay(iso) + days * dayMs);
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDay(toIso) - parseDay(fromIso)) / dayMs);
}

/** Entry deadline proposed for an event: 14 days before the first day. */
export function suggestEntryDeadline(startDate: string): string {
  return addDays(startDate, -14);
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const slugifyTitle = (title: string) => slugify(title, 60);
