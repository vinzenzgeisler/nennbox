import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

if (!process.env.NENNBOX_TEST_DATABASE_URL)
  throw new Error(
    'NENNBOX_TEST_DATABASE_URL required (disposable migrated database)',
  );
const suite =
  'packages/adapter-postgres/src/waitlist-category.integration.test.ts';
const source = 'packages/adapter-postgres/src/waitlist-offer.ts';
const directory = mkdtempSync(join(tmpdir(), 'waitlist-countercheck-'));
const report = join(directory, 'results.json');
const run = () => {
  const result = spawnSync(
    'npx',
    [
      'vitest',
      'run',
      suite,
      '--no-file-parallelism',
      '--reporter=json',
      '--outputFile=' + report,
    ],
    { encoding: 'utf8', env: process.env },
  );
  if (result.error) throw result.error;
  return { result, report: JSON.parse(readFileSync(report, 'utf8')) };
};
const db = new pg.Client({
  connectionString: process.env.NENNBOX_TEST_DATABASE_URL,
});
await db.connect();
try {
  const baseline = run();
  if (baseline.result.status !== 0)
    throw new Error(baseline.result.stdout + baseline.result.stderr);
  const original = readFileSync(source, 'utf8');
  try {
    writeFileSync(
      source,
      execFileSync('git', ['show', '0792554:' + source], { encoding: 'utf8' }),
    );
    const broken = run();
    const failed = broken.report.testResults
      .flatMap((s) => s.assertionResults)
      .filter((t) => t.status === 'failed')
      .map((t) => t.title);
    for (const title of [
      'rejected',
      'withdrawn',
      'rejected-candidate',
      'unknown',
    ]) {
      if (!failed.includes(title))
        throw new Error('Raw status regression survived: ' + title);
      console.log('RED without category fix: ' + title);
    }
  } finally {
    writeFileSync(source, original);
  }
  const saved = (
    await db.query(
      "SELECT pg_get_functiondef('invalidate_workbasket_event(uuid,uuid)'::regprocedure) AS definition",
    )
  ).rows[0].definition;
  try {
    await db.query(`CREATE OR REPLACE FUNCTION invalidate_workbasket_event(org uuid,ev uuid) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO workbasket_invalidation(organization_id,event_id) SELECT org,ev
      WHERE EXISTS(SELECT 1 FROM event WHERE organization_id=org AND id=ev); END $$`);
    const broken = run();
    const failed = broken.report.testResults
      .flatMap((s) => s.assertionResults)
      .filter((t) => t.status === 'failed')
      .map((t) => t.title);
    if (!failed.some((t) => t.startsWith('bounds unread invalidations')))
      throw new Error('Unbounded invalidation regression survived');
    console.log('RED without cleanup: unread invalidation bound');
  } finally {
    await db.query(saved);
  }
  if (run().result.status !== 0)
    throw new Error('Restored implementation failed');
  console.log('GREEN after restoration: all category and cleanup regressions');
} finally {
  await db.end();
  rmSync(directory, { recursive: true, force: true });
}
