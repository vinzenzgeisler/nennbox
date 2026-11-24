import { describe, expect, it, vi } from 'vitest';
import { duplicateFields } from './workbasket-checks.js';
import {
  evaluateWorkbasket,
  resolveWorkbasketConfig,
  type WorkbasketConfigOverrides,
  type WorkbasketEntry,
  type WorkbasketSnapshot,
} from './workbasket.js';

const entry = (i: number): WorkbasketEntry => ({
  id: String(i),
  classId: 'c',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  paid: true,
  documentsComplete: true,
  firstName: 'Person' + i,
  lastName: 'Test',
  dateOfBirth: '1990-01-01',
  email: i + '@example.org',
  vehicleId: 'v' + i,
  vin: 'VIN' + i,
  registration: 'AB CD ' + i,
  startNumber: String(i),
});
const snapshot = (entries: readonly WorkbasketEntry[]): WorkbasketSnapshot => ({
  today: '2026-11-24',
  eventDate: null,
  closingDate: null,
  classes: [{ id: 'c' }],
  entries,
});
const duplicatesOnly: WorkbasketConfigOverrides = {
  ready: { enabled: false },
  capacityNear: { enabled: false },
  waitlistPromotion: { enabled: false },
};

describe('indexed workbasket duplicate performance', () => {
  it.each([300, 500])(
    'normalizes linearly for %i unique and fully colliding entries',
    (n) => {
      for (const dense of [false, true]) {
        const entries = Array.from({ length: n }, (_, i) => ({
          ...entry(dense ? 0 : i),
          id: String(i),
        }));
        const normalize = vi.spyOn(String.prototype, 'normalize');
        let calls: number;
        let tasks;
        try {
          tasks = evaluateWorkbasket(snapshot(entries), duplicatesOnly);
          calls = normalize.mock.calls.length;
        } finally {
          normalize.mockRestore();
        }
        // Deterministic work budget, not a host-speed-dependent elapsed-time assertion.
        expect(calls).toBeLessThanOrEqual(7 * n);
        expect(tasks).toHaveLength(dense ? n * 3 : 0);
      }
    },
  );

  it.each([
    'duplicatePerson',
    'duplicateVehicle',
    'duplicateStartNumber',
  ] as const)('never reads matching inputs for disabled %s', (ruleId) => {
    const fields = {
      duplicatePerson: ['firstName', 'lastName', 'email', 'dateOfBirth'],
      duplicateVehicle: ['vehicleId', 'vin', 'registration'],
      duplicateStartNumber: ['startNumber'],
    }[ruleId];
    const entries = [entry(0), entry(1)];
    for (const value of entries)
      for (const field of fields)
        Object.defineProperty(value, field, {
          get: () => {
            throw new Error('Disabled duplicate input read: ' + field);
          },
        });
    expect(() =>
      evaluateWorkbasket(snapshot(entries), {
        ...duplicatesOnly,
        [ruleId]: { enabled: false },
      }),
    ).not.toThrow();
  });

  it('matches the pairwise evidence oracle across mixed classes and overlapping identities', () => {
    let seed = 233;
    const next = (maximum: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 16) % maximum;
    };
    for (let run = 0; run < 40; run++) {
      const classes = [
        { id: 'c', allowsMultipleStarts: true },
        { id: 'd', allowsMultipleStarts: true },
        { id: 'e', allowsMultipleStarts: false },
      ];
      const entries = Array.from({ length: 25 }, (_, i) => ({
        ...entry(i),
        classId: ['c', 'd', 'e', 'unknown'][next(4)]!,
        status: ['pending', 'accepted', 'withdrawn', 'rejected'][next(4)]!,
        firstName: [' MAX ', 'ＭＡＸ', 'other', ''][next(4)]!,
        lastName: ['Test', ' TEST ', '', 'Other'][next(4)]!,
        dateOfBirth: ['1990-01-01', '1990-01-01T12:00:00Z', null, 'invalid'][
          next(4)
        ]!,
        email: ['a@test.org', ' A@TEST.ORG ', '', null][next(4)]!,
        vehicleId: [' V ', 'v', '', null][next(4)]!,
        vin: ['ＶＩＮ-１', 'vin 1', '', 'different'][next(4)]!,
        registration: ['AB-CD 12', 'ab cd12', '', null][next(4)]!,
        startNumber: [' 1 ', '１', '2', ''][next(4)]!,
      }));
      const config = resolveWorkbasketConfig({
        ...duplicatesOnly,
        duplicatePerson: { enabled: next(2) === 0 },
        duplicateVehicle: { enabled: next(2) === 0 },
        duplicateStartNumber: { enabled: next(2) === 0 },
      });
      const expected = new Map<string, Set<string>>();
      const active = entries.filter(
        (value) => !['withdrawn', 'rejected'].includes(value.status),
      );
      for (let i = 0; i < active.length; i++) {
        const a = active[i]!;
        for (const b of active.slice(i + 1)) {
          const matches = duplicateFields(a, b);
          const allowed =
            a.classId !== b.classId &&
            classes.find((value) => value.id === a.classId)
              ?.allowsMultipleStarts === true &&
            classes.find((value) => value.id === b.classId)
              ?.allowsMultipleStarts === true;
          const evidence = [
            ['duplicatePerson', allowed ? [] : matches.person],
            ['duplicateVehicle', allowed ? [] : matches.vehicle],
            ['duplicateStartNumber', matches.number ? ['startNumber'] : []],
          ] as const;
          for (const [ruleId, fields] of evidence) {
            if (!config[ruleId].enabled || !fields.length) continue;
            for (const value of [a, b]) {
              const key = ruleId + ':' + value.id;
              const merged = expected.get(key) ?? new Set<string>();
              for (const field of fields) merged.add(field);
              expected.set(key, merged);
            }
          }
        }
      }
      const normalize = vi.spyOn(String.prototype, 'normalize');
      let actual;
      let calls: number;
      try {
        actual = evaluateWorkbasket({ ...snapshot(entries), classes }, config);
        calls = normalize.mock.calls.length;
      } finally {
        normalize.mockRestore();
      }
      expect(calls).toBeLessThanOrEqual(7 * active.length);
      expect(
        actual
          .map((task) => [
            task.ruleId + ':' + task.entryId,
            [...task.fields].sort(),
          ])
          .sort(),
      ).toEqual(
        [...expected].map(([key, fields]) => [key, [...fields].sort()]).sort(),
      );
      expect(
        evaluateWorkbasket(
          { ...snapshot([...entries].reverse()), classes },
          config,
        ),
      ).toEqual(actual);
    }
  });
});
