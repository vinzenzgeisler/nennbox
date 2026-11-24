import { z } from 'zod';
import { apiRequest } from '../remote/apiRequest.js';

export const ruleLabels: Record<string, string> = {
  ready: 'Bereit zum Zulassen',
  missingDocuments: 'Fehlende Unterlagen',
  paymentOpen: 'Zahlung offen',
  displacement: 'Hubraum prüfen',
  year: 'Baujahr prüfen',
  expiredLicense: 'Lizenz abgelaufen',
  expiredDocument: 'Dokument abgelaufen',
  minorGuardian: 'Erziehungsberechtigte fehlen',
  duplicateStartNumber: 'Startnummer doppelt',
  duplicatePerson: 'Person mehrfach genannt',
  duplicateVehicle: 'Fahrzeug mehrfach genannt',
  capacityNear: 'Klasse fast voll',
  waitlistPromotion: 'Warteliste nachrücken',
};
const TaskSchema = z.object({
  ruleId: z.string(),
  entryId: z.string().nullable(),
  classId: z.string(),
  reason: z.string(),
  fields: z.array(z.string()),
  severity: z.enum(['warning', 'task']),
});
export const WorkbasketSchema = z.object({
  tasks: z.array(TaskSchema),
  counts: z.record(z.string(), z.number()),
  generation: z.number(),
});
export type WorkbasketTask = z.infer<typeof TaskSchema>;
export function loadWorkbasket(eventId: string, signal?: AbortSignal) {
  return apiRequest(
    `/admin/events/${encodeURIComponent(eventId)}/workbasket`,
    WorkbasketSchema,
    signal ? { signal } : {},
  );
}
/** Presentation priority only; no business eligibility is inferred here. */
export function prioritizedTasks(tasks: WorkbasketTask[]) {
  const rank = (task: WorkbasketTask) =>
    task.severity === 'warning' ? 0 : task.ruleId === 'ready' ? 2 : 1;
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => rank(a.task) - rank(b.task) || a.index - b.index)
    .map(({ task }) => task);
}
