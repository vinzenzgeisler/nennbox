import type { WorkbasketConfig } from './workbasket-config.js';
import { workbasketDay } from './workbasket-checks.js';
import type {
  WorkbasketClass,
  WorkbasketEntry,
  WorkbasketTask,
} from './workbasket-model.js';

const normalized = (value: string | null | undefined) =>
  (value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const identifier = (value: string | null | undefined) =>
  normalized(value).replace(/[^\p{L}\p{N}]/gu, '');

type Dimension = {
  key: (entry: WorkbasketEntry) => string;
  fields: readonly string[];
};

const personDimensions: readonly Dimension[] = [
  {
    key: (entry) => {
      const first = normalized(entry.firstName);
      const last = normalized(entry.lastName);
      const day = workbasketDay(entry.dateOfBirth);
      return first && last && day !== null
        ? JSON.stringify([first, last, day])
        : '';
    },
    fields: ['firstName', 'lastName', 'dateOfBirth'],
  },
  { key: (entry) => normalized(entry.email), fields: ['email'] },
];
const vehicleDimensions: readonly Dimension[] = [
  { key: (entry) => normalized(entry.vehicleId), fields: ['vehicleId'] },
  { key: (entry) => identifier(entry.vin), fields: ['vin'] },
  { key: (entry) => identifier(entry.registration), fields: ['registration'] },
];

/**
 * Index each enabled identity dimension once. Class counts identify conflicting
 * neighbours without enumerating pairs, even if every entry shares one key.
 * Evidence is merged only for dimensions with a non-exempt neighbour.
 */
export function duplicateTasks(
  entries: readonly WorkbasketEntry[],
  classes: ReadonlyMap<string, WorkbasketClass>,
  config: WorkbasketConfig,
): WorkbasketTask[] {
  const tasks: WorkbasketTask[] = [];
  const allows = (classId: string) =>
    classes.get(classId)?.allowsMultipleStarts === true;
  const rules = [
    {
      ruleId: 'duplicatePerson',
      dimensions: personDimensions,
      reason:
        'Dieselbe Person ist mehrfach genannt; Doppelstarts sind nicht beidseitig erlaubt.',
    },
    {
      ruleId: 'duplicateVehicle',
      dimensions: vehicleDimensions,
      reason:
        'Dasselbe Fahrzeug ist mehrfach genannt; Doppelstarts sind nicht beidseitig erlaubt.',
    },
    {
      ruleId: 'duplicateStartNumber',
      dimensions: [
        {
          key: (entry: WorkbasketEntry) => normalized(entry.startNumber),
          fields: ['startNumber'],
        },
      ],
      reason: 'Die Startnummer ist mehrfach vergeben.',
    },
  ] as const;
  for (const { ruleId, dimensions, reason } of rules) {
    if (!config[ruleId].enabled) continue;
    const related = new Map<WorkbasketEntry, Map<string, Set<string>>>();
    const evidence = new Map<WorkbasketEntry, Set<string>>();
    for (const dimension of dimensions) {
      const buckets = new Map<string, WorkbasketEntry[]>();
      for (const entry of entries) {
        const key = dimension.key(entry);
        if (!key) continue;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(entry);
        else buckets.set(key, [entry]);
      }
      for (const bucket of buckets.values()) {
        if (bucket.length < 2) continue;
        const classCounts = new Map<string, number>();
        let restricted = 0;
        if (ruleId !== 'duplicateStartNumber') {
          for (const entry of bucket) {
            classCounts.set(
              entry.classId,
              (classCounts.get(entry.classId) ?? 0) + 1,
            );
            if (!allows(entry.classId)) restricted++;
          }
        }
        const firstByClass = new Map<string, WorkbasketEntry[]>();
        const restrictedEntries = bucket
          .filter((entry) => !allows(entry.classId))
          .slice(0, 2);
        for (const entry of bucket) {
          const group = firstByClass.get(entry.classId) ?? [];
          if (group.length < 2) group.push(entry);
          firstByClass.set(entry.classId, group);
        }
        for (const entry of bucket) {
          if (
            ruleId !== 'duplicateStartNumber' &&
            allows(entry.classId) &&
            restricted === 0 &&
            classCounts.get(entry.classId) === 1
          )
            continue;
          let fields = evidence.get(entry);
          if (!fields) evidence.set(entry, (fields = new Set()));
          for (const field of dimension.fields) fields.add(field);
          // One actual conflicting neighbour per dimension bounds dense projections.
          const neighbour = [
            ...(firstByClass.get(entry.classId) ?? []),
            ...restrictedEntries,
            ...bucket.slice(0, 2),
          ].find(
            (other) =>
              other.id !== entry.id &&
              (ruleId === 'duplicateStartNumber' ||
                other.classId === entry.classId ||
                !allows(entry.classId) ||
                !allows(other.classId)),
          );
          if (neighbour) {
            const matches =
              related.get(entry) ?? new Map<string, Set<string>>();
            const matchedFields =
              matches.get(neighbour.id) ?? new Set<string>();
            for (const field of dimension.fields) matchedFields.add(field);
            matches.set(neighbour.id, matchedFields);
            related.set(entry, matches);
          }
        }
      }
    }
    for (const [entry, fields] of evidence)
      tasks.push({
        ruleId,
        entryId: entry.id,
        classId: entry.classId,
        reason,
        related: [...(related.get(entry) ?? [])].map(([id, fields]) => ({
          id,
          fields: [...fields],
        })),
        fields: [...fields],
        severity: 'warning',
      });
  }
  return tasks;
}
