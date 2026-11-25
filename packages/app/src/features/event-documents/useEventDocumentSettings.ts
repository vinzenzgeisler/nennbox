import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EventDocumentsApiError,
  loadEventDocumentSettings,
  saveDocumentTypes,
} from './eventDocumentsApi.js';
import {
  documentTypeErrors,
  draftFromType,
  toTypeRequest,
  type DocumentTypeDraft,
} from './documentTypeModel.js';

type Loaded = {
  eventId: string;
  state: 'loading' | 'ready' | 'error';
  types: DocumentTypeDraft[];
  message: string;
};
const loading = (eventId: string): Loaded => ({
  eventId,
  state: 'loading',
  types: [],
  message: '',
});

/** Loads document types; the request ends when the event changes. */
export function useEventDocumentSettings(
  eventId: string,
  onSaved?: () => void,
) {
  const [data, setData] = useState<Loaded>(() => loading(eventId));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveScope = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    saveScope.current?.abort();
    setSaving(false);
    setData(loading(eventId));
    setSaved(false);
    void loadEventDocumentSettings(eventId, controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setData({
          eventId,
          state: 'ready',
          types: settings.types.map(draftFromType),
          message: '',
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setData({
          ...loading(eventId),
          state: 'error',
          message:
            error instanceof EventDocumentsApiError
              ? error.message
              : 'Die Einstellungen konnten nicht geladen werden.',
        });
      });
    return () => {
      controller.abort();
      saveScope.current?.abort();
    };
  }, [eventId]);
  const current = data.eventId === eventId ? data : loading(eventId);
  const errors = documentTypeErrors(current.types);
  const valid = errors.every((error) => !error);
  const change = useCallback((patch: Partial<Loaded>) => {
    setSaved(false);
    setData((value) => ({ ...value, ...patch, message: '' }));
  }, []);
  const save = useCallback(async () => {
    if (!valid || saving) return;
    const controller = new AbortController();
    saveScope.current = controller;
    setSaving(true);
    setSaved(false);
    try {
      const types = await saveDocumentTypes(
        eventId,
        toTypeRequest(current.types),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData((value) => ({
        ...value,
        types: types.map(draftFromType),
        message: '',
      }));
      setSaved(true);
      onSaved?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      setData((value) => ({
        ...value,
        message:
          error instanceof EventDocumentsApiError
            ? error.message
            : 'Speichern momentan nicht möglich.',
      }));
    } finally {
      if (saveScope.current === controller) saveScope.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }, [valid, saving, current, eventId, onSaved]);
  return {
    ...current,
    errors,
    saving,
    saved,
    valid,
    setTypes: (types: DocumentTypeDraft[]) => change({ types }),
    save,
  };
}
