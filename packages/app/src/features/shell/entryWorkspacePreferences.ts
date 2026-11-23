import { useEffect, useState, type RefObject } from 'react';

export function pushEntryEvent(id: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('eventId') !== id) {
    url.searchParams.set('eventId', id);
    for (const key of [
      'search',
      'classId',
      'acceptanceStatus',
      'verificationStatus',
      'paymentStatus',
      'missingDocuments',
      'sort',
      'direction',
      'page',
    ])
      url.searchParams.delete(key);
    window.history.pushState(window.history.state, '', url);
  }
}

export function usePreviewPreference() {
  const [previewOpen, setPreviewOpen] = useState(() => {
    try {
      return localStorage.getItem('nennbox.preview.collapsed') !== 'true';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('nennbox.preview.collapsed', String(!previewOpen));
    } catch {
      /* Storage may be unavailable. */
    }
  }, [previewOpen]);
  return [previewOpen, setPreviewOpen] as const;
}

export function useEntryEventHistory(
  events: Array<{ id: string }>,
  activeEvent: RefObject<string>,
  changeEvent: (id: string) => void,
) {
  useEffect(() => {
    const restoreEvent = () => {
      const id = new URLSearchParams(window.location.search).get('eventId');
      if (
        id &&
        id !== activeEvent.current &&
        events.some((event) => event.id === id)
      )
        changeEvent(id);
    };
    window.addEventListener('popstate', restoreEvent);
    return () => window.removeEventListener('popstate', restoreEvent);
  }, [changeEvent, events, activeEvent]);
}

export function readEntryEvent() {
  return new URLSearchParams(window.location.search).get('eventId') ?? '';
}

export type ShellEvent = {
  id: string;
  name: string;
  slug: string;
  registrationClosesAt: string | null;
  status: 'draft' | 'open' | 'closed' | 'archived';
};

/** Lenient read of `/admin/events`: rows without id and name are dropped, unknown status reads as draft. */
export function parseShellEvents(rows: unknown[]): ShellEvent[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Partial<Record<keyof ShellEvent, unknown>>;
    if (typeof value.id !== 'string' || typeof value.name !== 'string')
      return [];
    return [
      {
        id: value.id,
        name: value.name,
        slug: typeof value.slug === 'string' ? value.slug : '',
        registrationClosesAt:
          typeof value.registrationClosesAt === 'string'
            ? value.registrationClosesAt
            : null,
        status:
          value.status === 'open' ||
          value.status === 'closed' ||
          value.status === 'archived'
            ? value.status
            : 'draft',
      },
    ];
  });
}
