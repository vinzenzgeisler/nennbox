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
import { createParticipantMemoryErase } from './participant-memory-erase.js';
import { setParticipantMemoryProcessBounds } from './participant-memory-support.js';
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
  setParticipantMemoryProcessBounds(bounds);
  const access = createParticipantMemoryAccess(db, options);
  const consent = createParticipantMemoryConsent(db, bounds, options.tokenKey);
  const erase = createParticipantMemoryErase(db, options);
  const view = createParticipantMemoryView(db, bounds);
  return { ...access, ...consent, ...erase, ...view };
}
