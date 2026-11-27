import { describe, it, expect } from 'vitest';
import { evaluateWorkbasket } from './workbasket.js';
import type { WorkbasketEntry, WorkbasketSnapshot } from './workbasket.js';
const entry = (
  id: string,
  status: string,
  extra: Partial<WorkbasketEntry> = {},
): WorkbasketEntry => ({
  id,
  classId: 'c',
  status,
  createdAt: '2026-01-01',
  paid: false,
  documentsComplete: true,
  firstName: id,
  lastName: 'Test',
  dateOfBirth: null,
  email: null,
  ...extra,
});
const snapshot = (
  entries: WorkbasketEntry[],
  maximum: number | null = 1,
): WorkbasketSnapshot => ({
  today: '2026-06-01',
  now: '2026-06-01T12:00:00Z',
  eventDate: '2026-06-02',
  closingDate: null,
  classes: [{ id: 'c', maxParticipants: maximum }],
  entries,
});
describe('#29 capacity integration contract', () => {
  it.each(['pending', 'accepted'])(
    'reserves places for persisted %s non-waitlisted entries',
    (status) => {
      const tasks = evaluateWorkbasket(
        snapshot([entry('busy', status), entry('next', 'waitlisted')]),
      );
      expect(tasks.some((t) => t.ruleId === 'waitlistPromotion')).toBe(false);
      expect(tasks.some((t) => t.ruleId === 'capacityNear')).toBe(true);
    },
  );
  // Decision on #236/#244: a rejected entry releases its place like a withdrawn one.
  it.each(['rejected', 'withdrawn'])(
    'releases the place of a %s entry, so the first waiter can be offered it',
    (status) => {
      const tasks = evaluateWorkbasket(
        snapshot([entry('gone', status), entry('next', 'waitlisted')]),
      );
      expect(
        tasks
          .filter((t) => t.ruleId === 'waitlistPromotion')
          .map((t) => t.entryId),
      ).toEqual(['next']);
      expect(tasks.some((t) => t.ruleId === 'capacityNear')).toBe(false);
    },
  );
  it('uses the exact clock for offer expiry independently of the local calendar day', () => {
    const tasks = evaluateWorkbasket(
      snapshot([
        entry('old', 'waitlisted', {
          waitlistOfferSentAt: '2026-05-30T00:00:00Z',
          waitlistOfferedUntil: '2026-06-01T11:00:00Z',
        }),
        entry('next', 'waitlisted'),
      ]),
    );
    expect(
      tasks
        .filter((t) => t.ruleId === 'waitlistPromotion')
        .map((t) => t.entryId),
    ).toEqual(['next']);
  });
  it('does not reoffer an expired offer before #29 has processed it', () => {
    const tasks = evaluateWorkbasket(
      snapshot([
        entry('old', 'waitlisted', {
          waitlistOfferSentAt: '2026-05-30T00:00:00Z',
          waitlistOfferedUntil: '2026-06-01T11:00:00Z',
        }),
      ]),
    );
    expect(tasks.some((t) => t.ruleId === 'waitlistPromotion')).toBe(false);
  });
  it('allows unlimited classes to offer seats, without a near-capacity warning', () => {
    const tasks = evaluateWorkbasket(
      snapshot([entry('next', 'waitlisted')], null),
    );
    expect(tasks.some((t) => t.ruleId === 'waitlistPromotion')).toBe(true);
    expect(tasks.some((t) => t.ruleId === 'capacityNear')).toBe(false);
  });
  it('retains submillisecond ordering instead of falling back to UUID', () => {
    const tasks = evaluateWorkbasket(
      snapshot([
        entry('a', 'waitlisted', { createdAt: '2026-06-01T10:00:00.000002Z' }),
        entry('z', 'waitlisted', { createdAt: '2026-06-01T10:00:00.000001Z' }),
      ]),
    );
    expect(
      tasks
        .filter((t) => t.ruleId === 'waitlistPromotion')
        .map((t) => t.entryId),
    ).toEqual(['z']);
  });
  it('uses the local registration day without changing the chronological timestamp', () => {
    const tasks = evaluateWorkbasket(
      snapshot([
        entry('a', 'pending', {
          createdAt: '2026-05-24T23:30:00.000001Z',
          createdOn: '2026-05-25',
          documentsComplete: false,
        }),
      ]),
    );
    expect(tasks.some((t) => t.ruleId === 'missingDocuments')).toBe(true);
    const younger = evaluateWorkbasket(
      snapshot([
        entry('a', 'pending', {
          createdAt: '2026-05-25T23:30:00.000001Z',
          createdOn: '2026-05-26',
          documentsComplete: false,
        }),
      ]),
    );
    expect(younger.some((t) => t.ruleId === 'missingDocuments')).toBe(false);
  });
});
