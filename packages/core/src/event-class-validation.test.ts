import { describe, it, expect } from 'vitest';
import { validateClass } from './event-class-validation.js';
import {
  CreateEventClassRequest,
  UpdateEventClassRequest,
} from '@nennbox/contracts';
describe('workbasket class limit validation', () => {
  it.each([
    { minDisplacementCc: -1 },
    { maxDisplacementCc: 1.5 },
    { minYear: 0 },
    { maxYear: 2147483648 },
    { minDisplacementCc: 2000, maxDisplacementCc: 1999 },
    { minYear: 2000, maxYear: 1999 },
  ])('rejects invalid limits %j', (patch) =>
    expect(() => validateClass(patch, true)).toThrow(),
  );
  it.each([
    { minDisplacementCc: 0, maxDisplacementCc: 0 },
    { minYear: 2000, maxYear: 2000 },
    { minYear: null, maxYear: null },
    { allowsMultipleStarts: true },
  ])('accepts inclusive/open limits %j', (patch) =>
    expect(() => validateClass(patch, true)).not.toThrow(),
  );
  it('preserves absent policy fields in existing class requests', () => {
    const payload = {
      name: 'Open',
      code: 'OPEN',
      vehicleType: 'car',
      sortOrder: 0,
      maxParticipants: null,
      closed: false,
    };
    expect(CreateEventClassRequest.parse(payload)).toEqual(payload);
    expect(
      UpdateEventClassRequest.parse({
        allowsMultipleStarts: true,
        maxDisplacementCc: 2000,
      }),
    ).toEqual({ allowsMultipleStarts: true, maxDisplacementCc: 2000 });
    expect(UpdateEventClassRequest.safeParse({ minYear: 0 }).success).toBe(
      false,
    );
  });
});
