import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import type { RequestContext } from '@nennbox/core';
import type { Pool } from 'pg';
import type { Database } from './database.js';

/** Fixed key of the session lock that serializes schema migrations of one database. */
const MIGRATION_LOCK_KEY = '4208150042';

/**
 * Applies pending migrations. A session advisory lock makes parallel callers
 * (several service processes at start-up, parallel test runs) take turns: the
 * second one finds nothing left to apply instead of racing the first.
 */
export async function migrate(
  databaseUrl: string,
  options: { migrationsFolder?: string } = {},
): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  const lock = await pool.connect();
  try {
    await lock.query('select pg_advisory_lock($1::bigint)', [
      MIGRATION_LOCK_KEY,
    ]);
    await drizzleMigrate(drizzle(pool), {
      migrationsFolder:
        options.migrationsFolder ??
        new URL('../migrations', import.meta.url).pathname,
    });
  } finally {
    await lock
      .query('select pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    lock.release();
    await pool.end();
  }
}

export async function withOrganizationTransaction<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.organization_id', ${ctx.organizationId}, true)`,
    );
    return fn(tx as unknown as Database);
  });
}

export async function createDatabase(databaseUrl: string) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool), pool: pool as Pool };
}
