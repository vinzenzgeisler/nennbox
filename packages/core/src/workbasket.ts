import { resolveWorkbasketConfig } from './workbasket-config.js';
import type {
  WorkbasketConfig,
  WorkbasketConfigOverrides,
} from './workbasket-config.js';
import {
  duplicateFields,
  entryWarnings,
  workbasketDay,
} from './workbasket-checks.js';
import type {
  WorkbasketEntry,
  WorkbasketSnapshot,
  WorkbasketTask,
} from './workbasket-model.js';

export * from './workbasket-model.js';
export * from './workbasket-config.js';

const inactive = new Set([
  'withdrawn',
  'rejected',
  'cancelled',
  'canceled',
  'draft',
  'deleted',
]);
const waiting = (entry: WorkbasketEntry) => entry.status === 'waitlisted';

/**
 * Pure, deterministic advisory projection. No clock, I/O, mutation or automatic actions.
 * Dates are ISO calendar dates; expiry is inclusive. Start-number conflicts are event-wide.
 * Duplicate exemptions apply only across DIFFERENT classes that BOTH allow multiple starts.
 * Capacity matches #29: all non-withdrawn, non-waitlisted entries plus active offers.
 */
export function evaluateWorkbasket(
  snapshot: WorkbasketSnapshot,
  overrides: WorkbasketConfig | WorkbasketConfigOverrides = {},
): WorkbasketTask[] {
  const config = resolveWorkbasketConfig(overrides);
  const today = workbasketDay(snapshot.today);
  if (today === null)
    throw new Error('Arbeitskorb benötigt ein gültiges heutiges Datum.');
  const now = Date.parse(snapshot.now ?? snapshot.today);
  const classes = new Map(snapshot.classes.map((klass) => [klass.id, klass]));
  const entries = snapshot.entries
    .filter((entry) => !inactive.has(entry.status))
    .slice()
    .sort((a, b) => compare(a.id, b.id));
  const tasks: WorkbasketTask[] = [];
  const add = (
    ruleId: WorkbasketTask['ruleId'],
    entry: WorkbasketEntry,
    reason: string,
    fields: readonly string[],
    severity: WorkbasketTask['severity'] = 'task',
  ) => {
    if (config[ruleId].enabled)
      tasks.push({
        ruleId,
        entryId: entry.id,
        classId: entry.classId,
        reason,
        fields,
        severity,
      });
  };
  for (const entry of entries)
    tasks.push(
      ...entryWarnings(
        entry,
        classes.get(entry.classId),
        snapshot.eventDate,
        config,
      ),
    );

  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]!;
    for (const b of entries.slice(i + 1)) {
      const matches = duplicateFields(a, b);
      if (matches.number)
        for (const entry of [a, b])
          add(
            'duplicateStartNumber',
            entry,
            'Die Startnummer ist mehrfach vergeben.',
            ['startNumber'],
            'warning',
          );
      const allowed =
        a.classId !== b.classId &&
        classes.get(a.classId)?.allowsMultipleStarts === true &&
        classes.get(b.classId)?.allowsMultipleStarts === true;
      if (allowed) continue;
      for (const entry of [a, b]) {
        if (matches.person.length)
          add(
            'duplicatePerson',
            entry,
            'Dieselbe Person ist mehrfach genannt; Doppelstarts sind nicht beidseitig erlaubt.',
            matches.person,
            'warning',
          );
        if (matches.vehicle.length)
          add(
            'duplicateVehicle',
            entry,
            'Dasselbe Fahrzeug ist mehrfach genannt; Doppelstarts sind nicht beidseitig erlaubt.',
            matches.vehicle,
            'warning',
          );
      }
    }
  }

  const warned = new Set(
    tasks
      .filter((task) => task.severity === 'warning')
      .map((task) => task.entryId),
  );
  const closing = workbasketDay(snapshot.closingDate);
  for (const entry of entries) {
    const created = workbasketDay(entry.createdAt);
    if (
      !entry.documentsComplete &&
      created !== null &&
      today - created >= config.missingDocuments.days
    )
      add(
        'missingDocuments',
        entry,
        `Unterlagen fehlen seit mindestens ${config.missingDocuments.days} Tagen.`,
        ['documentsComplete', 'createdAt'],
      );
    // The window remains open after closing until payment is recorded.
    if (
      !entry.paid &&
      closing !== null &&
      today >= closing - config.paymentOpen.days
    )
      add(
        'paymentOpen',
        entry,
        `Zahlung offen; Nennschluss ist am ${snapshot.closingDate?.slice(0, 10)}.`,
        ['paid', 'closingDate'],
      );
    if (
      entry.status !== 'accepted' &&
      !waiting(entry) &&
      entry.paid &&
      entry.documentsComplete &&
      !warned.has(entry.id)
    )
      add(
        'ready',
        entry,
        'Unterlagen vollständig, bezahlt und ohne aktive Warnung: bereit zum Zulassen.',
        ['documentsComplete', 'paid', 'status'],
      );
  }

  for (const klass of snapshot.classes) {
    const maximum = klass.maxParticipants ?? Infinity;
    if (maximum <= 0) continue;
    const members = snapshot.entries.filter(
      (entry) =>
        entry.classId === klass.id &&
        entry.status !== 'withdrawn' &&
        entry.status !== 'deleted',
    );
    const offered = (entry: WorkbasketEntry) =>
      waiting(entry) &&
      !!entry.waitlistOfferedUntil &&
      Date.parse(entry.waitlistOfferedUntil) > now;
    const occupied = members.filter(
      (entry) => !waiting(entry) || offered(entry),
    ).length;
    if (
      config.capacityNear.enabled &&
      (occupied * 100) / maximum >= config.capacityNear.percent
    )
      tasks.push({
        ruleId: 'capacityNear',
        entryId: null,
        classId: klass.id,
        severity: 'warning',
        reason: `Klasse fast voll: ${occupied} von ${maximum} Plätzen belegt.`,
        fields: ['maxParticipants', 'status', 'waitlistOfferedUntil'],
      });
    const queue = members
      .filter(
        (entry) =>
          waiting(entry) && !offered(entry) && !entry.waitlistOfferSentAt,
      )
      .sort(
        (a, b) =>
          (a.waitlistPosition ?? Infinity) - (b.waitlistPosition ?? Infinity) ||
          compare(a.createdAt, b.createdAt) ||
          compare(a.id, b.id),
      );
    for (const entry of queue.slice(
      0,
      Math.max(0, Math.floor(maximum - occupied)),
    ))
      add(
        'waitlistPromotion',
        entry,
        'Freier Klassenplatz: Nachrücken von der Warteliste prüfen; keine automatische Zulassung.',
        [
          'maxParticipants',
          'status',
          'waitlistPosition',
          'waitlistOfferedUntil',
        ],
      );
  }
  // One task per rule/entry/class, merging evidence from multiple duplicate pairs.
  const unique = new Map<string, WorkbasketTask>();
  for (const task of tasks) {
    const key = JSON.stringify([task.ruleId, task.entryId, task.classId]);
    const previous = unique.get(key);
    unique.set(
      key,
      previous
        ? {
            ...task,
            fields: [...new Set([...previous.fields, ...task.fields])].sort(),
          }
        : task,
    );
  }
  return [...unique.values()].sort(
    (a, b) =>
      compare(a.ruleId, b.ruleId) ||
      compare(a.classId, b.classId) ||
      compare(a.entryId ?? '', b.entryId ?? ''),
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
