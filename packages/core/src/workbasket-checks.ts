import type { WorkbasketConfig } from './workbasket-config.js';
import type {
  WorkbasketClass,
  WorkbasketEntry,
  WorkbasketTask,
} from './workbasket-model.js';

/** Missing/invalid calendar values never manufacture an age or an expiry warning. */
export function workbasketDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const date = value.slice(0, 10);
  const parsed = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === date
    ? parsed / 86_400_000
    : null;
}

export function entryWarnings(
  entry: WorkbasketEntry,
  klass: WorkbasketClass | undefined,
  eventDate: string | null,
  config: WorkbasketConfig,
): WorkbasketTask[] {
  const tasks: WorkbasketTask[] = [];
  const add = (
    ruleId: WorkbasketTask['ruleId'],
    reason: string,
    fields: string[],
    values?: WorkbasketTask['values'],
  ) => {
    if (config[ruleId].enabled)
      tasks.push({
        ruleId,
        entryId: entry.id,
        classId: entry.classId,
        reason,
        ...(values ? { values } : {}),
        fields,
        severity: 'warning',
      });
  };
  for (const [rule, value, lower, upper, label, field] of [
    [
      'displacement',
      entry.displacementCc,
      klass?.minDisplacementCc,
      klass?.maxDisplacementCc,
      'Hubraum',
      'displacementCc',
    ],
    ['year', entry.year, klass?.minYear, klass?.maxYear, 'Baujahr', 'year'],
  ] as const) {
    if (
      value != null &&
      ((lower != null && value < lower) || (upper != null && value > upper))
    )
      add(
        rule,
        `${label} ${value} liegt außerhalb der Klassengrenzen (${lower ?? 'offen'}–${upper ?? 'offen'}).`,
        [
          field,
          rule === 'year' ? 'minYear' : 'minDisplacementCc',
          rule === 'year' ? 'maxYear' : 'maxDisplacementCc',
        ],
        { value, lower: lower ?? null, upper: upper ?? null },
      );
  }
  const eventDay = workbasketDay(eventDate);
  if (eventDay === null) return tasks;
  const licenseDay = workbasketDay(entry.licenseValidUntil);
  if (licenseDay !== null && licenseDay < eventDay)
    add(
      'expiredLicense',
      'Die Lizenz ist am Veranstaltungstag abgelaufen.',
      ['licenseValidUntil', 'eventDate'],
      { validUntil: entry.licenseValidUntil!, eventDate: eventDate! },
    );
  if (
    entry.documentValidUntil?.some((date) => {
      const day = workbasketDay(date);
      return day !== null && day < eventDay;
    })
  )
    add(
      'expiredDocument',
      'Mindestens ein Dokument ist am Veranstaltungstag abgelaufen.',
      ['documentValidUntil', 'eventDate'],
      {
        dates: entry.documentValidUntil!.filter((date) => {
          const day = workbasketDay(date);
          return day !== null && day < eventDay;
        }),
        documents: (entry.expiringDocuments ?? [])
          .filter((doc) => {
            const day = workbasketDay(doc.validUntil);
            return day !== null && day < eventDay;
          })
          .map((doc) => `${doc.name}: ${doc.validUntil}`),
        eventDate: eventDate!,
      },
    );
  const birthDay = workbasketDay(entry.dateOfBirth);
  if (birthDay !== null && birthDay <= eventDay) {
    const birth = new Date(birthDay * 86_400_000);
    const event = new Date(eventDay * 86_400_000);
    const age =
      event.getUTCFullYear() -
      birth.getUTCFullYear() -
      (event.getUTCMonth() < birth.getUTCMonth() ||
      (event.getUTCMonth() === birth.getUTCMonth() &&
        event.getUTCDate() < birth.getUTCDate())
        ? 1
        : 0);
    if (age < 18 && !entry.guardianName?.trim())
      add(
        'minorGuardian',
        'Am Veranstaltungstag minderjährig; Erziehungsberechtigte fehlen.',
        ['dateOfBirth', 'guardianName', 'eventDate'],
        { age, dateOfBirth: entry.dateOfBirth!, eventDate: eventDate! },
      );
  }
  return tasks;
}

const normalized = (value: string | null | undefined) =>
  (value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const identifier = (value: string | null | undefined) =>
  normalized(value).replace(/[^\p{L}\p{N}]/gu, '');
const same = (a: string, b: string) => a !== '' && a === b;

/** Return matching evidence only; blank identifiers are never duplicates. */
export function duplicateFields(a: WorkbasketEntry, b: WorkbasketEntry) {
  const person: string[] = [];
  if (
    same(normalized(a.firstName), normalized(b.firstName)) &&
    same(normalized(a.lastName), normalized(b.lastName)) &&
    workbasketDay(a.dateOfBirth) !== null &&
    workbasketDay(a.dateOfBirth) === workbasketDay(b.dateOfBirth)
  )
    person.push('firstName', 'lastName', 'dateOfBirth');
  if (same(normalized(a.email), normalized(b.email))) person.push('email');
  const vehicle: string[] = [];
  if (same(normalized(a.vehicleId), normalized(b.vehicleId)))
    vehicle.push('vehicleId');
  if (same(identifier(a.vin), identifier(b.vin))) vehicle.push('vin');
  if (same(identifier(a.registration), identifier(b.registration)))
    vehicle.push('registration');
  return {
    person,
    vehicle,
    number: same(normalized(a.startNumber), normalized(b.startNumber)),
  };
}
