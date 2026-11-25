import { describe, expect, it } from 'vitest';
import {
  registrationAccentNotice,
  registrationClubs,
  registrationNeutralAccent,
} from './registrationClubs.js';
import {
  deriveRegistrationPalette,
  registrationContrast,
} from './registrationPalette.js';

describe('example clubs (P7/P8)', () => {
  it('carries the six P7 clubs and the three theme clubs with fixed accents', () => {
    expect(
      registrationClubs.map((c) => [c.name, c.initials, c.accent]),
    ).toEqual([
      ['MSC Hohenstein e. V.', 'MSC', '#1F4E79'],
      ['AMC Rotwand', 'AMC', '#C0392B'],
      ['Kart Club Sonne', 'KCS', '#FFD400'],
      ['MSC Waldgrün', 'MSC', '#2E7D32'],
      ['Rennsport Nord', 'RSN', '#0A0A0C'],
      ['Standard · NENNBOX', 'NB', '#193B30'],
      ['Oldtimer Freunde Taunus', 'OF', '#6B2E2E'],
      ['Rennsport Nord e. V.', 'RN', '#0E6B74'],
      ['Kart Club Sonne', 'KCS', '#E8631A'],
    ]);
    expect(new Set(registrationClubs.map((c) => c.id)).size).toBe(
      registrationClubs.length,
    );
    expect(Object.isFrozen(registrationClubs)).toBe(true);
    expect(registrationClubs.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ['#1F4E79', null],
    ['#C0392B', null],
    ['#193B30', null],
    ['#0E6B74', null],
    ['#6B2E2E', null],
    ['#FFD400', 'darkened'],
    ['#E8D5E8', 'darkened'],
    ['#E8631A', 'darkened'],
    ['#0A0A0C', 'lightened'],
    ['#2E7D32', 'nearSuccess'],
  ])('reports the accent notice for %s', (raw, notice) => {
    expect(registrationAccentNotice(deriveRegistrationPalette(raw!))).toBe(
      notice,
    );
  });

  it('keeps the neutral-grey probe readable and hint-free', () => {
    const palette = deriveRegistrationPalette(registrationNeutralAccent);
    expect(registrationAccentNotice(palette)).toBeNull();
    expect(palette.measurements.textOnBase).toBeGreaterThanOrEqual(4.5);
    expect(palette.measurements.ringOnWhite).toBeGreaterThanOrEqual(3);
    expect(palette.measurements.textOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(palette.measurements.linkOnWhite).toBeGreaterThanOrEqual(4.5);
    expect(
      registrationContrast(palette.foreground, palette.base),
    ).toBeGreaterThan(4.5);
  });
});
