import { deriveParticipantMemoryToken } from '@nennbox/adapter-postgres';

interface Copy {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}
type Locale = 'de' | 'en';

export const participantMemoryMailContracts = {
  'participant-memory-link': ['linkUrl'],
  'participant-memory-delete': ['linkUrl'],
} as const;

/** Both mails carry a one-time link; the bearer is derived here, never stored in the outbox. */
export const participantMemoryMailCopy: Record<
  keyof typeof participantMemoryMailContracts,
  Record<Locale, Copy>
> = {
  'participant-memory-link': {
    de: {
      subject: 'Deine gespeicherten Nenndaten',
      text: 'Über diesen Link kannst du gespeicherte Nenndaten für eine neue Nennung übernehmen oder die Speicherung verwalten. Er ist 30 Minuten gültig und nur einmal nutzbar: {{linkUrl}} Hast du das nicht angefordert, ignoriere diese E-Mail.',
      html: '<p>Über diesen Link kannst du gespeicherte Nenndaten für eine neue Nennung übernehmen oder die Speicherung verwalten. Er ist 30 Minuten gültig und nur einmal nutzbar.</p><p><a href="{{linkUrl}}">Gespeicherte Nenndaten öffnen</a></p><p>Hast du das nicht angefordert, ignoriere diese E-Mail.</p>',
    },
    en: {
      subject: 'Your saved entry details',
      text: 'Use this link to reuse saved entry details for a new entry or to manage what is stored. It is valid for 30 minutes and works once: {{linkUrl}} If you did not request it, ignore this email.',
      html: '<p>Use this link to reuse saved entry details for a new entry or to manage what is stored. It is valid for 30 minutes and works once.</p><p><a href="{{linkUrl}}">Open saved entry details</a></p><p>If you did not request it, ignore this email.</p>',
    },
  },
  'participant-memory-delete': {
    de: {
      subject: 'Gespeicherte Nenndaten löschen',
      text: 'Mit diesem Link löschst du die bei diesem Verein gespeicherten Nenndaten. Bestehende Nennungen bleiben unverändert. Der Link ist 24 Stunden gültig und nur einmal nutzbar: {{linkUrl}} Hast du das nicht angefordert, ignoriere diese E-Mail.',
      html: '<p>Mit diesem Link löschst du die bei diesem Verein gespeicherten Nenndaten. Bestehende Nennungen bleiben unverändert. Der Link ist 24 Stunden gültig und nur einmal nutzbar.</p><p><a href="{{linkUrl}}">Gespeicherte Nenndaten löschen</a></p><p>Hast du das nicht angefordert, ignoriere diese E-Mail.</p>',
    },
    en: {
      subject: 'Delete your saved entry details',
      text: 'Use this link to delete the entry details this club has stored. Existing entries stay unchanged. The link is valid for 24 hours and works once: {{linkUrl}} If you did not request it, ignore this email.',
      html: '<p>Use this link to delete the entry details this club has stored. Existing entries stay unchanged. The link is valid for 24 hours and works once.</p><p><a href="{{linkUrl}}">Delete saved entry details</a></p><p>If you did not request it, ignore this email.</p>',
    },
  },
};

/** Relative link for a participant-memory mail; the worker binds it to the canonical origin afterwards. */
export function participantMemoryLink(
  templateKey: string,
  key: string | undefined,
  nonce: string,
): string | null {
  if (templateKey === 'participant-memory-link')
    return `/participant-memory#token=${deriveParticipantMemoryToken(key, 'access', nonce)}`;
  if (templateKey === 'participant-memory-delete')
    return `/participant-memory/delete#token=${deriveParticipantMemoryToken(key, 'delete', nonce)}`;
  return null;
}
