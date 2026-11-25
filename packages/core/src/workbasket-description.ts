import { workbasketDay } from './workbasket-checks.js';
import type {
  WorkbasketTask,
  WorkbasketSnapshot,
  WorkbasketEntryReference,
} from './workbasket-model.js';

const evidenceLabels: Record<string, [string, string]> = {
  firstName: ['Vorname', 'first name'],
  lastName: ['Nachname', 'last name'],
  dateOfBirth: ['Geburtsdatum', 'date of birth'],
  email: ['E-Mail', 'email'],
  vehicleId: ['Fahrzeug', 'vehicle'],
  vin: ['Fahrgestellnummer', 'VIN'],
  registration: ['Kennzeichen', 'registration'],
  startNumber: ['Startnummer', 'start number'],
};

/** Localized office copy formats facts already emitted by rules; it never decides eligibility. */
export function describeWorkbasketTasks(
  tasks: WorkbasketTask[],
  snapshot: WorkbasketSnapshot,
): WorkbasketTask[] {
  const classes = new Map(
    snapshot.classes.map((klass) => [klass.id, klass.name ?? klass.id]),
  );
  const entries = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
  const reference = (id: string): WorkbasketEntryReference => {
    const entry = entries.get(id)!;
    return {
      id,
      name: [entry.firstName, entry.lastName].filter(Boolean).join(' '),
      startNumber: entry.startNumber ?? null,
      organizationCode: entry.organizationCode ?? null,
      className: classes.get(entry.classId) ?? entry.classId,
      createdAt: entry.createdAt,
    };
  };
  return tasks.map((task) => {
    const entry = task.entryId ? reference(task.entryId) : null;
    const source = task.entryId ? entries.get(task.entryId) : null;
    const created = workbasketDay(source?.createdOn ?? source?.createdAt);
    const ageDays =
      created === null
        ? null
        : Math.max(0, workbasketDay(snapshot.today)! - created);
    const relatedEntries = (task.related ?? []).map((other) => ({
      ...reference(other.id),
      fields: other.fields,
    }));
    const v = task.values ?? {};
    let de = task.reason;
    let en = '';
    switch (task.ruleId) {
      case 'ready':
        de =
          'Bezahlt, Unterlagen vollständig, keine aktiven Warnungen — bereit zum Zulassen.';
        en =
          'Paid, documents complete, no active warnings — ready for admission.';
        break;
      case 'missingDocuments': {
        const names =
          (v.documents as string[] | undefined)?.join(', ') ||
          'Erforderliche Unterlagen';
        de = `${names} ${(v.documents as string[] | undefined)?.length === 1 ? 'fehlt' : 'fehlen'} seit ${v.days} Tagen.`;
        en = `${(v.documents as string[] | undefined)?.join(', ') || 'Required documents'} missing for ${v.days} days.`;
        break;
      }
      case 'paymentOpen':
        de = `Zahlung offen; Nennschluss am ${v.closingDate}.`;
        en = `Payment outstanding; registration closes on ${v.closingDate}.`;
        break;
      case 'displacement':
      case 'year': {
        const label =
          task.ruleId === 'year'
            ? ['Baujahr', 'Manufacture year']
            : ['Hubraum', 'Displacement'];
        const unit = task.ruleId === 'displacement' ? ' cm³' : '';
        de = `${label[0]} ${v.value}${unit}; Klassengrenzen ${v.lower ?? 'offen'}–${v.upper ?? 'offen'}${unit}.`;
        en = `${label[1]} ${v.value}${unit}; class limits ${v.lower ?? 'open'}–${v.upper ?? 'open'}${unit}.`;
        break;
      }
      case 'expiredLicense':
        de = `Lizenz gültig bis ${v.validUntil}; Veranstaltung am ${v.eventDate}.`;
        en = `License valid until ${v.validUntil}; event on ${v.eventDate}.`;
        break;
      case 'expiredDocument': {
        const documents = (v.documents as string[] | undefined)?.length
          ? v.documents
          : v.dates;
        de = `Abgelaufene Unterlagen: ${(documents as string[]).join(', ')}; Veranstaltung am ${v.eventDate}.`;
        en = `Expired documents: ${(documents as string[]).join(', ')}; event on ${v.eventDate}.`;
        break;
      }
      case 'minorGuardian':
        de = `${v.age} Jahre am Veranstaltungstag (${v.eventDate}); Erziehungsberechtigte fehlen.`;
        en = `Age ${v.age} on event day (${v.eventDate}); guardian missing.`;
        break;
      case 'capacityNear':
        de = `${v.occupied} von ${v.maximum} Plätzen belegt.`;
        en = `${v.occupied} of ${v.maximum} places occupied.`;
        break;
      case 'waitlistPromotion':
        de = `${v.available} freie Klassenplätze; Wartelistenplatz ${v.position ?? 'nicht vergeben'} — Nachrücken prüfen.`;
        en = `${v.available} class places available; waitlist position ${v.position ?? 'unassigned'} — review promotion.`;
        break;
      default: {
        const descriptions = relatedEntries.map((other) => {
          const identifier = other.startNumber
            ? '#' + other.startNumber
            : (other.organizationCode ?? other.name);
          return [
            `${identifier} (${other.fields.map((field) => evidenceLabels[field]?.[0] ?? field).join(', ')})`,
            `${identifier} (${other.fields.map((field) => evidenceLabels[field]?.[1] ?? field).join(', ')})`,
          ];
        });
        de = `Doppelt mit Nennung ${descriptions.map((pair) => pair[0]).join('; ')} — übereinstimmende Angaben.`;
        en = `Duplicate with entry ${descriptions.map((pair) => pair[1]).join('; ')} — matching details.`;
      }
    }
    return {
      ...task,
      entry,
      className: classes.get(task.classId) ?? task.classId,
      ageDays,
      detail: { de, en },
      relatedEntries,
    };
  });
}
