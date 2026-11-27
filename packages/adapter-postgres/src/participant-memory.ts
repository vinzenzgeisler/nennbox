import {
  assertParticipantMemoryRetention,
  defaultParticipantMemoryRetention,
  type CanonicalOrigin,
  type ParticipantMemoryRepository,
  type ParticipantMemoryRetention,
} from '@nennbox/core';
import type { Database } from './database.js';
import { createParticipantMemoryAccess } from './participant-memory-access.js';
import { createParticipantMemoryConsent } from './participant-memory-consent.js';
import { createParticipantMemoryView } from './participant-memory-view.js';

export function createParticipantMemoryRepository(
  db: Database,
  options: {
    tokenKey: string;
    canonicalOrigin: CanonicalOrigin;
    retention?: ParticipantMemoryRetention;
  },
): ParticipantMemoryRepository {
  const bounds = assertParticipantMemoryRetention(
    options.retention ?? defaultParticipantMemoryRetention,
  );
  const access = createParticipantMemoryAccess(db, options);
  const consent = createParticipantMemoryConsent(db, bounds);
  const view = createParticipantMemoryView(db, bounds);
  return { ...access, ...consent, ...view };
}
