import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { findAvailableOrgaCode, generateOrgaCode } from '@nennbox/core';
import type { RequestContext } from '@nennbox/core';
import type { Database, TransactionDatabase } from './database.js';

export const ORGA_CODE_MAX_ATTEMPTS = 10;

export async function allocateOrgaCode(
  tx: TransactionDatabase,
  _ctx: RequestContext,
  _eventId: string,
  generate: () => string = () =>
    generateOrgaCode((length) => randomBytes(length)),
): Promise<string> {
  // Serialize allocations only, so check-then-insert cannot race across tenants.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(719204172)`);
  return findAvailableOrgaCode(
    async (candidate) => {
      const result = await tx.execute(sql`
        SELECT 1 FROM entry WHERE orga_code = ${candidate} LIMIT 1
      `);
      return result.rows.length > 0;
    },
    generate,
    ORGA_CODE_MAX_ATTEMPTS,
  );
}

function isTransactionDatabase(value: unknown): value is TransactionDatabase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'execute' in value &&
    typeof value.execute === 'function'
  );
}

export function withAllocatedOrgaCode<T>(
  db: Database,
  executor: unknown,
  ctx: RequestContext,
  eventId: string,
  write: (tx: TransactionDatabase, orgaCode: string) => Promise<T>,
): Promise<T> {
  if (executor !== undefined && executor !== null) {
    if (!isTransactionDatabase(executor))
      throw new Error('Unsupported database executor');
    return allocateOrgaCode(executor, ctx, eventId).then((code) =>
      write(executor, code),
    );
  }
  return db.transaction(async (tx) => {
    const code = await allocateOrgaCode(tx, ctx, eventId);
    return write(tx, code);
  });
}
