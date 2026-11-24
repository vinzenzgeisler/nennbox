import { describe, expect, it } from 'vitest';
import {
  evaluateWorkbasket,
  resolveWorkbasketConfig,
  validateWorkbasketConfig,
  workbasketRuleIds,
} from './workbasket.js';
import type {
  WorkbasketEntry,
  WorkbasketSnapshot,
  WorkbasketConfigOverrides,
  WorkbasketRuleId,
} from './workbasket.js';

const entry = (patch: Partial<WorkbasketEntry> = {}): WorkbasketEntry => ({
  id: 'a',
  classId: 'c',
  createdAt: '2026-06-01T14:00:00Z',
  status: 'pending',
  paid: true,
  documentsComplete: true,
  firstName: 'Max',
  lastName: 'Muster',
  dateOfBirth: '1990-01-01',
  email: 'max@example.org',
  ...patch,
});
const snapshot = (
  patch: Partial<WorkbasketSnapshot> = {},
): WorkbasketSnapshot => ({
  today: '2026-06-08',
  eventDate: '2026-07-01',
  closingDate: '2026-06-15',
  entries: [entry()],
  classes: [{ id: 'c', maxParticipants: 10 }],
  ...patch,
});
const rules = (s: WorkbasketSnapshot, config: WorkbasketConfigOverrides = {}) =>
  evaluateWorkbasket(s, config).map((task) => task.ruleId);
const has = (
  rule: WorkbasketRuleId,
  patch: Partial<WorkbasketEntry>,
  s: Partial<WorkbasketSnapshot> = {},
) => rules(snapshot({ entries: [entry(patch)], ...s })).includes(rule);

describe('workbasket configuration', () => {
  it('enables every rule and resolves defaults with field-level event precedence', () => {
    const config = resolveWorkbasketConfig(
      {
        missingDocuments: { enabled: false, days: 14 },
        paymentOpen: { days: 10 },
      },
      { missingDocuments: { days: 3 } },
    );
    expect(config.missingDocuments).toEqual({ enabled: false, days: 3 });
    expect(config.paymentOpen).toEqual({ enabled: true, days: 10 });
    expect(config.capacityNear).toEqual({ enabled: true, percent: 90 });
    expect(resolveWorkbasketConfig().missingDocuments.days).toBe(7);
    expect(
      workbasketRuleIds.every((id) => resolveWorkbasketConfig()[id].enabled),
    ).toBe(true);
  });
  it.each([
    null,
    [],
    true,
    'bad',
    { unknown: {} },
    { ready: false },
    { ready: { days: 2 } },
    { ready: { enabled: 'false' } },
    { paymentOpen: { days: -1 } },
    { missingDocuments: { days: 0.5 } },
    { paymentOpen: { days: Infinity } },
    { missingDocuments: { days: NaN } },
    { paymentOpen: { days: Number.MAX_SAFE_INTEGER + 1 } },
    { capacityNear: { percent: 0 } },
    { capacityNear: { percent: 101 } },
    { ready: { enabled: undefined } },
    { ready: null },
  ])('rejects malformed override %#', (value) => {
    expect(() => validateWorkbasketConfig(value)).toThrow();
  });
  it('accepts empty/partial overrides and zero-day thresholds without retaining input references', () => {
    const input = { paymentOpen: { days: 0 }, capacityNear: { percent: 99.5 } };
    expect(validateWorkbasketConfig(input)).toEqual(input);
    expect(validateWorkbasketConfig({})).toEqual({});
    expect(resolveWorkbasketConfig(input).paymentOpen.days).toBe(0);
    expect(validateWorkbasketConfig(input).paymentOpen).not.toBe(
      input.paymentOpen,
    );
    expect(resolveWorkbasketConfig().ready).not.toBe(
      resolveWorkbasketConfig().ready,
    );
  });
});

describe('workbasket dates and plausibility', () => {
  it.each([
    ['2026-06-07', false],
    ['2026-06-08', true],
    ['2026-06-09', true],
  ])('missing documents age boundary on %s', (today, expected) => {
    expect(
      has('missingDocuments', { documentsComplete: false }, { today }),
    ).toBe(expected);
  });
  it.each([
    ['2026-06-07', false],
    ['2026-06-08', true],
    ['2026-06-15', true],
    ['2026-06-16', true],
  ])(
    'payment reminder starts seven days before closing, on %s',
    (today, expected) => {
      expect(has('paymentOpen', { paid: false }, { today })).toBe(expected);
    },
  );
  it('respects changed thresholds, missing dates and future creation', () => {
    expect(
      rules(
        snapshot({
          entries: [entry({ paid: false, documentsComplete: false })],
        }),
        {
          paymentOpen: { days: 6 },
          missingDocuments: { days: 8 },
        },
      ),
    ).toEqual([]);
    expect(
      has('missingDocuments', {
        documentsComplete: false,
        createdAt: '2026-06-09',
      }),
    ).toBe(false);
    expect(has('paymentOpen', { paid: false }, { closingDate: null })).toBe(
      false,
    );
    expect(has('paymentOpen', { paid: true })).toBe(false);
    expect(has('missingDocuments', { documentsComplete: true })).toBe(false);
  });
  it.each([
    [999, true],
    [1000, false],
    [1500, false],
    [2000, false],
    [2001, true],
    [null, false],
  ])('checks inclusive displacement bounds: %s', (displacementCc, expected) => {
    expect(
      has(
        'displacement',
        { displacementCc },
        {
          classes: [
            {
              id: 'c',
              minDisplacementCc: 1000,
              maxDisplacementCc: 2000,
            },
          ],
        },
      ),
    ).toBe(expected);
  });
  it.each([
    [1969, true],
    [1970, false],
    [1980, false],
    [1990, false],
    [1991, true],
    [null, false],
  ])('checks inclusive model-year bounds: %s', (year, expected) => {
    expect(
      has(
        'year',
        { year },
        { classes: [{ id: 'c', minYear: 1970, maxYear: 1990 }] },
      ),
    ).toBe(expected);
  });
  it.each([
    ['2026-06-30', true],
    ['2026-07-01', false],
    ['2026-07-02', false],
    ['2026-02-30', false],
    ['invalid', false],
    [null, false],
  ])(
    'license and document expiry are event-day inclusive: %s',
    (date, expected) => {
      expect(has('expiredLicense', { licenseValidUntil: date })).toBe(expected);
      expect(
        has('expiredDocument', {
          documentValidUntil: date === null ? [] : [date],
        }),
      ).toBe(expected);
    },
  );
  it('uses calendar days, handles one expired document, and skips unknown event dates', () => {
    expect(
      has('expiredLicense', { licenseValidUntil: '2026-07-01T00:00:00+02:00' }),
    ).toBe(false);
    expect(
      has('expiredDocument', {
        documentValidUntil: ['2026-08-01', '2026-06-30'],
      }),
    ).toBe(true);
    expect(
      has(
        'expiredLicense',
        { licenseValidUntil: '2020-01-01' },
        { eventDate: null },
      ),
    ).toBe(false);
  });
  it.each([
    ['2008-07-01', null, false],
    ['2008-07-02', null, true],
    ['2008-06-30', null, false],
    ['2010-01-01', ' Eltern ', false],
    ['2010-01-01', ' ', true],
    [null, null, false],
    ['2027-01-01', null, false],
  ])(
    'uses age on event day: %s, guardian %s',
    (dateOfBirth, guardianName, expected) => {
      expect(has('minorGuardian', { dateOfBirth, guardianName })).toBe(
        expected,
      );
    },
  );
  it('rejects invalid today and skips invalid creation dates', () => {
    expect(() =>
      evaluateWorkbasket(snapshot({ today: '2026-02-30' })),
    ).toThrow();
    expect(
      has('missingDocuments', {
        documentsComplete: false,
        createdAt: 'garbage',
      }),
    ).toBe(false);
  });
});

describe('duplicates and admission', () => {
  it('requires payment, complete documents, pending status and no active warning', () => {
    expect(has('ready', {})).toBe(true);
    for (const patch of [
      { paid: false },
      { documentsComplete: false },
      { status: 'accepted' },
      { status: 'waitlisted' },
      { licenseValidUntil: '2020-01-01' },
    ])
      expect(has('ready', patch)).toBe(false);
    expect(
      rules(
        snapshot({ entries: [entry({ licenseValidUntil: '2020-01-01' })] }),
        { expiredLicense: { enabled: false } },
      ),
    ).toContain('ready');
  });
  it.each([
    'withdrawn',
    'rejected',
    'cancelled',
    'canceled',
    'draft',
    'deleted',
  ])('ignores inactive status %s for every rule', (status) => {
    expect(
      rules(
        snapshot({
          entries: [
            entry({
              status,
              paid: false,
              documentsComplete: false,
              licenseValidUntil: '2020-01-01',
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });
  it.each([
    [
      { firstName: ' MAX ', lastName: 'MUSTER', email: null },
      ['firstName', 'lastName', 'dateOfBirth'],
    ],
    [{ firstName: 'Other', email: ' MAX@EXAMPLE.ORG ' }, ['email']],
  ] as const)('matches normalized person identity %#', (patch, fields) => {
    const tasks = evaluateWorkbasket(
      snapshot({ entries: [entry(), entry({ id: 'b', ...patch })] }),
    );
    const duplicates = tasks.filter(
      (task) => task.ruleId === 'duplicatePerson',
    );
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0]?.fields).toEqual(fields);
    expect(tasks.some((task) => task.ruleId === 'ready')).toBe(false);
  });
  it.each([
    [{ vehicleId: 'vehicle' }, { vehicleId: 'vehicle' }, 'vehicleId'],
    [{ vin: 'WVW-123' }, { vin: 'wvw 123' }, 'vin'],
    [
      { registration: 'AB-CD 123' },
      { registration: 'ab cd123' },
      'registration',
    ],
  ] as const)('matches vehicle identity %#', (a, b, field) => {
    const tasks = evaluateWorkbasket(
      snapshot({ entries: [entry(a), entry({ id: 'b', ...b })] }),
    );
    expect(
      tasks.filter((task) => task.ruleId === 'duplicateVehicle'),
    ).toHaveLength(2);
    expect(
      tasks.find((task) => task.ruleId === 'duplicateVehicle')?.fields,
    ).toEqual([field]);
  });
  it('does not match blank identity fields or missing birth dates', () => {
    const blank = {
      firstName: '',
      lastName: '',
      email: ' ',
      dateOfBirth: null,
      vin: '',
      registration: null,
    };
    expect(
      rules(
        snapshot({ entries: [entry(blank), entry({ id: 'b', ...blank })] }),
      ),
    ).toEqual(['ready', 'ready']);
    expect(
      rules(
        snapshot({
          entries: [
            entry({ email: null, dateOfBirth: null }),
            entry({
              id: 'b',
              email: null,
              dateOfBirth: null,
            }),
          ],
        }),
      ),
    ).not.toContain('duplicatePerson');
  });
  it.each([
    [true, true, false, false],
    [true, false, false, true],
    [false, true, false, true],
    [false, false, false, true],
    [true, true, true, true],
  ])(
    'double starts require distinct, jointly permissive classes %#',
    (allowA, allowB, sameClass, duplicate) => {
      const s = snapshot({
        classes: [
          { id: 'c', allowsMultipleStarts: allowA },
          { id: 'd', allowsMultipleStarts: allowB },
        ],
        entries: [
          entry({ vehicleId: 'v', startNumber: '12' }),
          entry({
            id: 'b',
            classId: sameClass ? 'c' : 'd',
            vehicleId: 'v',
            startNumber: '12',
          }),
        ],
      });
      expect(rules(s).includes('duplicatePerson')).toBe(duplicate);
      expect(rules(s).includes('duplicateVehicle')).toBe(duplicate);
      expect(rules(s)).toContain('duplicateStartNumber');
    },
  );
  it('deduplicates repeated matches into one task per rule and entry', () => {
    const tasks = evaluateWorkbasket(
      snapshot({
        entries: ['a', 'b', 'd'].map((id) => entry({ id, startNumber: '12' })),
      }),
    );
    expect(
      tasks.filter((task) => task.ruleId === 'duplicatePerson'),
    ).toHaveLength(3);
    expect(
      tasks.filter((task) => task.ruleId === 'duplicateStartNumber'),
    ).toHaveLength(3);
  });
});

describe('capacity and advisory waitlist promotion', () => {
  const members = (accepted: number) =>
    Array.from({ length: accepted }, (_, i) =>
      entry({
        id: String(i),
        firstName: String(i),
        email: null,
        status: 'accepted',
      }),
    );
  it.each([
    [8, false],
    [9, true],
    [10, true],
    [11, true],
  ])(
    'near capacity threshold counts accepted entries: %s',
    (count, expected) => {
      const tasks = evaluateWorkbasket(snapshot({ entries: members(count) }));
      expect(tasks.some((task) => task.ruleId === 'capacityNear')).toBe(
        expected,
      );
      if (expected)
        expect(
          tasks.find((task) => task.ruleId === 'capacityNear')?.entryId,
        ).toBeNull();
    },
  );
  it('matches #29 pending occupancy, supports threshold overrides and unlimited/zero capacity', () => {
    expect(
      rules(snapshot({ entries: members(8) }), {
        capacityNear: { percent: 80 },
      }),
    ).toContain('capacityNear');
    expect(
      rules(
        snapshot({
          entries: members(9).map((e) => ({ ...e, status: 'pending' })),
        }),
      ),
    ).toContain('capacityNear');
    for (const maxParticipants of [null, 0])
      expect(
        rules(
          snapshot({
            classes: [{ id: 'c', maxParticipants }],
            entries: members(10),
          }),
        ),
      ).not.toContain('capacityNear');
  });
  it('offers only available places in position/creation/id order and reserves active offers', () => {
    const s = snapshot({
      classes: [{ id: 'c', maxParticipants: 3 }],
      entries: [
        ...members(1),
        entry({
          id: 'offer',
          status: 'waitlisted',
          waitlistPosition: 1,
          waitlistOfferedUntil: '2026-06-09',
        }),
        entry({ id: 'later', status: 'waitlisted', waitlistPosition: 4 }),
        entry({ id: 'next', status: 'waitlisted', waitlistPosition: 2 }),
      ],
    });
    expect(
      evaluateWorkbasket(s)
        .filter((t) => t.ruleId === 'waitlistPromotion')
        .map((t) => t.entryId),
    ).toEqual(['next']);
    expect(
      evaluateWorkbasket({
        ...s,
        classes: [{ id: 'c', maxParticipants: 1 }],
      }).some((t) => t.ruleId === 'waitlistPromotion'),
    ).toBe(false);
  });
  it('releases expired offers at the exact deadline and orders equal ranks deterministically', () => {
    const s = snapshot({
      today: '2026-06-08T10:00:00Z',
      classes: [{ id: 'c', maxParticipants: 1 }],
      entries: ['b', 'a'].map((id) =>
        entry({
          id,
          status: 'waitlisted',
          waitlistPosition: 1,
          waitlistOfferedUntil: '2026-06-08T10:00:00Z',
        }),
      ),
    });
    expect(
      evaluateWorkbasket(s)
        .filter((t) => t.ruleId === 'waitlistPromotion')
        .map((t) => t.entryId),
    ).toEqual(['a']);
  });
});

describe('all rules are independently switchable, explained, deterministic and pure', () => {
  const rich = snapshot({
    classes: [
      { id: 'c', maxParticipants: 1, minDisplacementCc: 1000, minYear: 1980 },
      { id: 'd', maxParticipants: 1 },
    ],
    entries: [
      entry({
        id: 'accepted',
        status: 'accepted',
        email: null,
        firstName: 'Other',
      }),
      entry({ id: 'wait', status: 'waitlisted', email: null, classId: 'd' }),
      entry({
        paid: false,
        documentsComplete: false,
        displacementCc: 1,
        year: 1900,
        licenseValidUntil: '2020-01-01',
        documentValidUntil: ['2020-01-01'],
        dateOfBirth: '2010-01-01',
        vehicleId: 'v',
        startNumber: '1',
      }),
      entry({
        id: 'b',
        dateOfBirth: '2010-01-01',
        vehicleId: 'v',
        startNumber: '1',
      }),
      entry({
        id: 'ready',
        email: null,
        firstName: 'Ready',
        dateOfBirth: null,
      }),
    ],
  });
  it.each(workbasketRuleIds)(
    'supports disabling %s without changing other config',
    (rule) => {
      expect(rules(rich)).toContain(rule);
      expect(rules(rich, { [rule]: { enabled: false } })).not.toContain(rule);
    },
  );
  it('returns stable German explanations, fields and valid severity without mutations', () => {
    const before = JSON.stringify(rich);
    const tasks = evaluateWorkbasket(rich);
    expect(
      evaluateWorkbasket({
        ...rich,
        entries: [...rich.entries].reverse(),
        classes: [...rich.classes].reverse(),
      }),
    ).toEqual(tasks);
    expect(JSON.stringify(rich)).toBe(before);
    const explanations: Record<WorkbasketRuleId, [string, string[], string]> = {
      ready: [
        'Unterlagen vollständig, bezahlt und ohne aktive Warnung: bereit zum Zulassen.',
        ['documentsComplete', 'paid', 'status'],
        'task',
      ],
      missingDocuments: [
        'Unterlagen fehlen seit mindestens 7 Tagen.',
        ['documentsComplete', 'createdAt'],
        'task',
      ],
      paymentOpen: [
        'Zahlung offen; Nennschluss ist am 2026-06-15.',
        ['paid', 'closingDate'],
        'task',
      ],
      displacement: [
        'Hubraum 1 liegt außerhalb der Klassengrenzen (1000–offen).',
        ['displacementCc', 'minDisplacementCc', 'maxDisplacementCc'],
        'warning',
      ],
      year: [
        'Baujahr 1900 liegt außerhalb der Klassengrenzen (1980–offen).',
        ['year', 'minYear', 'maxYear'],
        'warning',
      ],
      expiredLicense: [
        'Die Lizenz ist am Veranstaltungstag abgelaufen.',
        ['licenseValidUntil', 'eventDate'],
        'warning',
      ],
      expiredDocument: [
        'Mindestens ein Dokument ist am Veranstaltungstag abgelaufen.',
        ['documentValidUntil', 'eventDate'],
        'warning',
      ],
      minorGuardian: [
        'Am Veranstaltungstag minderjährig; Erziehungsberechtigte fehlen.',
        ['dateOfBirth', 'guardianName', 'eventDate'],
        'warning',
      ],
      duplicateStartNumber: [
        'Die Startnummer ist mehrfach vergeben.',
        ['startNumber'],
        'warning',
      ],
      duplicatePerson: [
        'Dieselbe Person ist mehrfach genannt; Doppelstarts sind nicht beidseitig erlaubt.',
        ['firstName', 'lastName', 'dateOfBirth', 'email'],
        'warning',
      ],
      duplicateVehicle: [
        'Dasselbe Fahrzeug ist mehrfach genannt; Doppelstarts sind nicht beidseitig erlaubt.',
        ['vehicleId'],
        'warning',
      ],
      capacityNear: [
        'Klasse fast voll: 4 von 1 Plätzen belegt.',
        ['maxParticipants', 'status', 'waitlistOfferedUntil'],
        'warning',
      ],
      waitlistPromotion: [
        'Freier Klassenplatz: Nachrücken von der Warteliste prüfen; keine automatische Zulassung.',
        [
          'maxParticipants',
          'status',
          'waitlistPosition',
          'waitlistOfferedUntil',
        ],
        'task',
      ],
    };
    expect(new Set(tasks.map((t) => t.ruleId))).toEqual(
      new Set(workbasketRuleIds),
    );
    for (const task of tasks) {
      const [reason, fields, severity] = explanations[task.ruleId];
      expect(task.reason).toBe(reason);
      expect([...task.fields].sort()).toEqual([...fields].sort());
      expect(task.severity).toBe(severity);
    }
  });
});
