import { z } from 'zod';

// Read the advisory projection verbatim; never derive findings from entry data.
export const entryWarningSchema = z.object({
  ruleId: z.string(),
  entryId: z.string().nullable(),
  classId: z.string(),
  reason: z.string(),
  fields: z.array(z.string()),
  severity: z.enum(['warning', 'task']),
});
export type EntryWarning = z.infer<typeof entryWarningSchema>;
export const warningsResponseSchema = z.object({
  warnings: z.array(entryWarningSchema),
});
export const workbasketWarningsSchema = z.object({
  tasks: z.array(entryWarningSchema),
});
export function warningsForEntry(warnings: EntryWarning[], entryId: string) {
  return warnings.filter(
    (warning) => warning.severity === 'warning' && warning.entryId === entryId,
  );
}
const fieldLabels: Record<string, string> = {
  documentsComplete: 'Unterlagen vollständig',
  createdAt: 'Eingangszeitpunkt',
  createdOn: 'Eingangstag',
  paid: 'Zahlungsstand',
  status: 'Nennungsstatus',
  closingDate: 'Nennungsschluss',
  maxParticipants: 'Klassenkapazität',
  waitlistPosition: 'Wartelistenplatz',
  waitlistOfferedUntil: 'Angebotsfrist der Warteliste',
  firstName: 'Vorname',
  lastName: 'Nachname',
  dateOfBirth: 'Geburtsdatum',
  email: 'E-Mail',
  guardianName: 'Erziehungsberechtigte',
  licenseValidUntil: 'Lizenz gültig bis',
  eventDate: 'Veranstaltungstag',
  vehicleId: 'Fahrzeug',
  vin: 'FIN',
  registration: 'Kennzeichen',
  displacementCc: 'Hubraum',
  minDisplacementCc: 'Hubraum-Untergrenze',
  maxDisplacementCc: 'Hubraum-Obergrenze',
  year: 'Baujahr',
  minYear: 'Baujahr-Untergrenze',
  maxYear: 'Baujahr-Obergrenze',
  startNumber: 'Startnummer',
  documentValidUntil: 'Dokument gültig bis',
};
export function warningEvidence(warning: EntryWarning) {
  return warning.fields.map((field) => fieldLabels[field] ?? field).join(', ');
}
