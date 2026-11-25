import { useState } from 'react';
import { createDraft, type Draft } from './model.js';

export const draftStorageKey = 'nennbox-registration-preview-v1';
function loadDraft(): Draft {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(draftStorageKey) ?? 'null',
    );
    const template = createDraft();
    const matches = (value: unknown, shape: unknown): boolean => {
      if (shape === null)
        return value === null || (typeof value === 'object' && value !== null);
      if (Array.isArray(shape))
        return (
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((item) => matches(item, shape[0]))
        );
      if (typeof shape === 'object')
        return (
          typeof value === 'object' &&
          value !== null &&
          Object.entries(shape).every(([key, sample]) =>
            matches((value as Record<string, unknown>)[key], sample),
          )
        );
      return typeof value === typeof shape;
    };
    return matches(raw, template) ? (raw as Draft) : template;
  } catch {
    return createDraft();
  }
}
export function useDraft() {
  const [draft, changeDraft] = useState<Draft>(loadDraft);
  const [savedAt, setSavedAt] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const setDraft = (next: Draft) => {
    changeDraft(next);
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(next));
      setSavedAt(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  };
  return { draft, setDraft, savedAt, storageFailed };
}
