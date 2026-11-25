import { z } from 'zod';
import { EntryResponse } from '@nennbox/contracts';
import { request } from '../entries/AdminEntriesModel.js';

const Tasks = z.object({
  tasks: z.array(
    z.object({ ruleId: z.string(), entryId: z.string().nullable() }),
  ),
});
export type Admission = {
  entryId: string;
  name: string;
  to: string;
  label: string;
};
export type BulkResult = { entryId: string; ok: boolean; message: string };

async function read(path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const response = await request(path, ...(signal ? [{ signal }] : []));
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Keine Berechtigung für diese Aktion.'
        : 'Aktuelle Daten konnten nicht geladen werden.',
    );
  return response.json() as Promise<unknown>;
}
export async function freshRuleEntries(
  eventId: string,
  ruleId: string,
  signal?: AbortSignal,
) {
  const value = Tasks.parse(
    await read(
      `/admin/events/${encodeURIComponent(eventId)}/workbasket`,
      signal,
    ),
  );
  return new Set(
    value.tasks
      .filter((task) => task.ruleId === ruleId && task.entryId)
      .map((task) => task.entryId!),
  );
}
export async function admissionFor(
  eventId: string,
  entryId: string,
  signal?: AbortSignal,
): Promise<Admission> {
  const entry = EntryResponse.parse(
    await read(`/admin/entries/${encodeURIComponent(entryId)}`, signal),
  );
  if (entry.id !== entryId || entry.eventId !== eventId || entry.deletedAt)
    throw new Error('Nennung gehört nicht mehr zur Auswahl.');
  const targets =
    entry.acceptanceTransitions?.filter(
      (target) =>
        target.category === 'accepted' &&
        entry.availableActions?.includes(`acceptance:${target.to}`),
    ) ?? [];
  if (targets.length !== 1)
    throw new Error(
      'Kein eindeutiger erlaubter Zulassungsstatus im angehefteten Workflow verfügbar. Bitte einzeln prüfen.',
    );
  const target = targets[0]!;
  return {
    entryId,
    name: entry.adminDetails?.driver.name || entryId,
    to: target.to,
    label: target.label,
  };
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Aktion fehlgeschlagen.';
}
export async function prepareAdmissions(eventId: string, ids: string[]) {
  const eligible = await freshRuleEntries(eventId, 'ready');
  const admissions: Admission[] = [];
  const results: BulkResult[] = [];
  for (const entryId of [...new Set(ids)]) {
    try {
      if (!eligible.has(entryId))
        throw new Error('Nicht mehr bereit zum Zulassen.');
      admissions.push(await admissionFor(eventId, entryId));
    } catch (error) {
      results.push({ entryId, ok: false, message: errorText(error) });
    }
  }
  return { admissions, results };
}
/** Sequential requests; refresh eligibility and authorization immediately before every mutation. */
export async function executeAdmissions(
  eventId: string,
  admissions: Admission[],
  reason: string,
  signal?: AbortSignal,
) {
  const results: BulkResult[] = [];
  for (const planned of admissions) {
    try {
      if (
        !(await freshRuleEntries(eventId, 'ready', signal)).has(planned.entryId)
      )
        throw new Error('Nicht mehr bereit zum Zulassen; übersprungen.');
      const current = await admissionFor(eventId, planned.entryId, signal);
      if (current.to !== planned.to || current.label !== planned.label)
        throw new Error('Zielstatus geändert; bitte neu bestätigen.');
      const response = await request(
        `/admin/entries/${encodeURIComponent(planned.entryId)}/transitions`,
        {
          method: 'POST',
          ...(signal ? { signal } : {}),
          body: JSON.stringify({
            requireReadyForEvent: eventId,
            transition: 'acceptance',
            status: planned.to,
            reason,
          }),
        },
      );
      if (response.status === 409) {
        const error = (await response.json()) as { error?: string };
        throw new Error(
          error.error ?? 'Nicht mehr bereit zum Zulassen; übersprungen.',
        );
      }
      if (!response.ok)
        throw new Error(
          'Statusänderung abgelehnt oder fehlgeschlagen. Bitte einzeln prüfen.',
        );
      const updated = EntryResponse.parse(await response.json());
      if (
        updated.id !== planned.entryId ||
        updated.eventId !== eventId ||
        updated.acceptanceStatus !== planned.to
      )
        throw new Error(
          'Antwort nicht eindeutig. Bitte aktuellen Status prüfen.',
        );
      results.push({
        entryId: planned.entryId,
        ok: true,
        message: `Zugelassen: ${planned.label}`,
      });
    } catch (error) {
      results.push({
        entryId: planned.entryId,
        ok: false,
        message: errorText(error),
      });
    }
  }
  return results;
}
