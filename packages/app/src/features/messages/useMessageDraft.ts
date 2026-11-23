import { useEffect, useState } from 'react';
import {
  MessageRecipientFilterSchema,
  type MessageAttachmentRecord,
} from '@nennbox/contracts';
import type { MessageSeed } from './messageSeed.js';

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
        return {
          ...empty,
          ...value,
          filter: MessageRecipientFilterSchema.parse(value.filter),
        };
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
  const dirty = Boolean(
    draft.subject || draft.body || draft.attachments.length,
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
  return { draft, setDraft };
}
