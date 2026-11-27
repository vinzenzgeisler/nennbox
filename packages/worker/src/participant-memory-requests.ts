import {
  createParticipantMemoryRequestProcessor,
  type Database,
} from '@nennbox/adapter-postgres';

/**
 * Decides the queued link requests: only addresses this club knows get a mail.
 * Runs every minute; the public request path never waits for it.
 */
export function createParticipantMemoryRequestsTask(deps: {
  db: Database;
  tokenKey: string;
}) {
  const processor = createParticipantMemoryRequestProcessor(deps.db, {
    tokenKey: deps.tokenKey,
  });
  return async () => {
    await processor.processPending();
  };
}
