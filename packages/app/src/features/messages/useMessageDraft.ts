import { useEffect, useState } from 'react';
import {
  MessageRecipientFilterSchema,
  type MessageAttachmentRecord,
} from '@nennbox/contracts';
import type { MessageSeed } from './messageSeed.js';

const isDirty = (draft: {
  subject: string;
  body: string;
  attachments: unknown[];
}) => Boolean(draft.subject || draft.body || draft.attachments.length);

export function useMessageDraft(eventId: string, seed?: MessageSeed) {
  const storageKey = 'nennbox:message-draft:' + eventId;
  const [draft, setDraft] = useState(() => {
    const empty = {
      filter: MessageRecipientFilterSchema.parse({}),
      search: '',
      addresses: '',
      subject: '',
      body: '',
      attachments: [] as MessageAttachmentRecord[],
    };
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved) as typeof empty;
        const restored = {
          ...empty,
          ...value,
          filter: MessageRecipientFilterSchema.parse(value.filter),
        };
        // A seed is an explicit request, but it never replaces unsent text.
        if (!seed || isDirty(restored)) return restored;
      }
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    return {
      ...empty,
      filter: MessageRecipientFilterSchema.parse({
        entryIds: seed ? [seed.entryId] : [],
      }),
      subject: seed?.subject ?? '',
      body: seed?.body ?? '',
    };
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* Keep the live draft even when storage is full. */
    }
  }, [draft, storageKey]);
  const dirty = isDirty(draft);
  const [seedKept] = useState(
    () => Boolean(seed) && dirty && draft.filter.entryIds[0] !== seed?.entryId,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return { draft, setDraft, seedKept };
}
