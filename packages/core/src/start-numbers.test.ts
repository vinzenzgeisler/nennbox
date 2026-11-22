import { describe, expect, it } from 'vitest';
import {
  projectStartNumber,
  allocateNextStartNumbers,
  availableStartNumbers,
  confirmationDeadline,
  dueWaitlistOffers,
  nextWaitlistPosition,
} from './start-numbers.js';

describe('start number and waitlist domain functions', () => {
  it('excludes reserved and assigned numbers and allocates in stable order', () => {
    const available = availableStartNumbers(
      { from: 1, to: 5, reserved: [2], classId: null },
      ['4'],
    );
    expect(available).toEqual(['1', '3', '5']);
    expect(
      allocateNextStartNumbers([{ id: 'a' }, { id: 'b' }], available),
    ).toEqual([
      { entryId: 'a', startNumber: '1' },
      { entryId: 'b', startNumber: '3' },
    ]);
  });
  it('computes monotonic positions and configurable default deadlines', () => {
    expect(nextWaitlistPosition([1, 3, null])).toBe(4);
    const now = new Date('2026-01-01T00:00:00Z');
    expect(confirmationDeadline(now).toISOString()).toBe(
      '2026-01-03T00:00:00.000Z',
    );
  });
  it('selects expired offers only', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(
      dueWaitlistOffers(
        [
          { id: 'a', deadline: now },
          { id: 'b', deadline: null },
        ],
        now,
      ).map((x) => x.id),
    ).toEqual(['a']);
  });
});

describe('start number read model', () => {
  it.each([
    [null, null, 'unassigned'],
    ['42', null, 'requested'],
    ['42', '18', 'assigned'],
    [null, '42', 'assigned'],
  ] as const)(
    'projects wish %s and assignment %s as %s',
    (requestedStartNumber, assignedStartNumber, startNumberStatus) => {
      expect(
        projectStartNumber({ requestedStartNumber, assignedStartNumber }),
      ).toEqual({ assignedStartNumber, startNumberStatus });
    },
  );
  it('does not promote a legacy request to an assignment', () => {
    expect(projectStartNumber({ requestedStartNumber: '42' })).toEqual({
      assignedStartNumber: null,
      startNumberStatus: 'requested',
    });
  });
});
