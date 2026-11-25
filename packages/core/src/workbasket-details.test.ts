import { expect, it } from 'vitest';
import {
  evaluateWorkbasket,
  type WorkbasketEntry,
  type WorkbasketSnapshot,
  type WorkbasketRuleId,
} from './workbasket.js';

const entry: WorkbasketEntry = {
  id: 'a',
  classId: 'c',
  createdAt: '2026-06-01T12:00:00Z',
  firstName: 'Erika',
  lastName: 'Test',
  dateOfBirth: '2000-01-01',
  email: 'test@example.org',
  status: 'pending',
  paid: true,
  documentsComplete: true,
  startNumber: '47',
  organizationCode: 'NB-47',
};
const snapshot: WorkbasketSnapshot = {
  today: '2026-06-13',
  eventDate: '2026-07-01',
  closingDate: '2026-06-15',
  entries: [entry],
  classes: [
    {
      id: 'c',
      name: 'Tourenwagen',
      maxParticipants: 10,
      maxDisplacementCc: 1600,
      maxYear: 1990,
    },
  ],
};
it.each<
  [WorkbasketRuleId, Partial<WorkbasketEntry>, Record<string, unknown>, string]
>([
  ['ready', {}, {}, 'Bezahlt, Unterlagen vollständig'],
  [
    'missingDocuments',
    { documentsComplete: false, missingDocumentNames: ['Fahrzeugschein'] },
    { days: 12, documents: ['Fahrzeugschein'] },
    'Fahrzeugschein fehlt seit 12 Tagen',
  ],
  [
    'paymentOpen',
    { paid: false },
    { closingDate: '2026-06-15' },
    'Nennschluss am 2026-06-15',
  ],
  [
    'displacement',
    { displacementCc: 1998 },
    { value: 1998, lower: null, upper: 1600 },
    '1998 cm³; Klassengrenzen offen–1600 cm³',
  ],
  [
    'year',
    { year: 1998 },
    { value: 1998, lower: null, upper: 1990 },
    'Baujahr 1998',
  ],
  [
    'expiredLicense',
    { licenseValidUntil: '2026-06-30' },
    { validUntil: '2026-06-30', eventDate: '2026-07-01' },
    'Lizenz gültig bis 2026-06-30',
  ],
  [
    'expiredDocument',
    {
      documentValidUntil: ['2026-06-30'],
      expiringDocuments: [{ name: 'Lizenz', validUntil: '2026-06-30' }],
    },
    {
      dates: ['2026-06-30'],
      documents: ['Lizenz: 2026-06-30'],
      eventDate: '2026-07-01',
    },
    'Lizenz: 2026-06-30',
  ],
  [
    'minorGuardian',
    { dateOfBirth: '2010-07-02' },
    { age: 15, dateOfBirth: '2010-07-02', eventDate: '2026-07-01' },
    '15 Jahre',
  ],
  [
    'waitlistPromotion',
    { status: 'waitlisted', waitlistPosition: 3 },
    { available: 10, position: 3 },
    '10 freie Klassenplätze; Wartelistenplatz 3',
  ],
])('%s exposes concrete office values', (rule, patch, values, description) => {
  const task = evaluateWorkbasket({
    ...snapshot,
    entries: [{ ...entry, ...patch }],
  }).find((task) => task.ruleId === rule)!;
  expect(task.values ?? {}).toEqual(values);
  expect(task.detail?.de).toContain(description);
  expect(task.detail?.en).toBeTruthy();
  expect(task.entry).toEqual({
    id: 'a',
    name: 'Erika Test',
    startNumber: '47',
    organizationCode: 'NB-47',
    className: 'Tourenwagen',
    createdAt: entry.createdAt,
  });
  expect(task.ageDays).toBe(12);
});
it('capacity carries actual occupied and total places', () => {
  const task = evaluateWorkbasket({
    ...snapshot,
    classes: [{ id: 'c', name: 'Tourenwagen', maxParticipants: 1 }],
  }).find((task) => task.ruleId === 'capacityNear')!;
  expect(task.values).toEqual({ occupied: 1, maximum: 1 });
  expect(task.detail).toEqual({
    de: '1 von 1 Plätzen belegt.',
    en: '1 of 1 places occupied.',
  });
  expect(task.entry).toBeNull();
  expect(task.className).toBe('Tourenwagen');
});
it.each([
  'duplicatePerson',
  'duplicateVehicle',
  'duplicateStartNumber',
] as const)(
  '%s links a real matching counterpart with exact evidence',
  (rule) => {
    const tasks = evaluateWorkbasket({
      ...snapshot,
      entries: [
        { ...entry, vehicleId: 'vehicle' },
        { ...entry, id: 'b', organizationCode: 'NB-48', vehicleId: 'vehicle' },
      ],
    });
    const task = tasks.find(
      (task) => task.ruleId === rule && task.entryId === 'a',
    )!;
    expect(task.relatedEntries).toEqual([
      expect.objectContaining({
        id: 'b',
        name: 'Erika Test',
        organizationCode: 'NB-48',
        fields:
          rule === 'duplicatePerson'
            ? ['firstName', 'lastName', 'dateOfBirth', 'email']
            : rule === 'duplicateVehicle'
              ? ['vehicleId']
              : ['startNumber'],
      }),
    ]);
    expect(task.detail?.de).toContain('Doppelt mit Nennung #47');
    expect(
      tasks.find((task) => task.ruleId === rule && task.entryId === 'b')
        ?.relatedEntries?.[0]?.id,
    ).toBe('a');
  },
);
