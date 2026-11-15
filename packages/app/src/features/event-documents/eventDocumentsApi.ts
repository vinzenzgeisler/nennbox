import { z } from 'zod';
import {
  EntryDocumentTypeSchema,
  type EntryDocumentType,
} from '@racepilot/contracts';
import { adminFetch } from '../../auth.js';

export class EventDocumentsApiError extends Error {}

const TypesResponse = z.object({ items: z.array(EntryDocumentTypeSchema) });
const eventPath = (eventId: string) =>
  `/admin/events/${encodeURIComponent(eventId)}`;
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function call<T extends z.ZodType>(
  path: string,
  schema: T,
  failure: string,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await adminFetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new EventDocumentsApiError('Keine Verbindung zum Server.');
  }
  if (!response.ok)
    throw new EventDocumentsApiError(
      response.status === 403 ? 'Dafür fehlt dir die Berechtigung.' : failure,
    );
  return schema.parse(await response.json());
}

export type EventDocumentSettings = {
  types: EntryDocumentType[];
};

export async function loadEventDocumentSettings(
  eventId: string,
  signal: AbortSignal,
): Promise<EventDocumentSettings> {
  const types = await call(
    `${eventPath(eventId)}/entry-document-types`,
    TypesResponse,
    'Die Unterlagen konnten nicht geladen werden.',
    { signal },
  );
  return { types: types.items };
}

export const saveDocumentTypes = (
  eventId: string,
  types: readonly EntryDocumentType[],
  signal: AbortSignal,
) =>
  call(
    `${eventPath(eventId)}/entry-document-types`,
    TypesResponse,
    'Die Unterlagen konnten nicht gespeichert werden.',
    { ...json('PUT', { types }), signal },
  ).then((response) => response.items);
