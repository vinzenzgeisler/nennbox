import { describe, expect, it } from 'vitest';
import {
  demoRequestedStartNumber,
  legacyDemoGradientImages,
  rows,
} from './community-demo-data.js';

describe('demo number distribution', () => {
  it('includes confirmed-number candidates, unconfirmed wishes, and empty numbers', () => {
    const accepted = rows.flatMap((row, index) =>
      row[5] === 'accepted' ? [index] : [],
    );
    expect(accepted.length).toBeGreaterThan(0);
    for (const index of accepted)
      expect(demoRequestedStartNumber(index)).toBe(rows[index]![4]);
    const pending = rows.flatMap((row, index) =>
      ['pending', 'waitlisted'].includes(row[5])
        ? [demoRequestedStartNumber(index)]
        : [],
    );
    expect(pending.some((number) => number !== null)).toBe(true);
    expect(pending.some((number) => number === null)).toBe(true);
    rows.forEach((row, index) => {
      if (['rejected', 'withdrawn'].includes(row[5]))
        expect(demoRequestedStartNumber(index)).toBeNull();
    });
  });

  it('recognizes exactly the four historical placeholder images', () => {
    expect(new Set(legacyDemoGradientImages).size).toBe(4);
    for (const image of legacyDemoGradientImages) {
      expect(Buffer.from(image.split(',')[1]!, 'base64').toString()).toContain(
        '<linearGradient',
      );
    }
    expect(legacyDemoGradientImages).not.toContain(
      '/api/uploads/vehicle-photo.jpg',
    );
  });
});
