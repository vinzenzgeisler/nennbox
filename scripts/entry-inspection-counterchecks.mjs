import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!process.env.NENNBOX_TEST_DATABASE_URL)
  throw new Error('NENNBOX_TEST_DATABASE_URL required');
const api = 'packages/api/src/routes/entries.ts';
const repository = 'packages/adapter-postgres/src/entry-status-dimensions.ts';
const workflow = 'packages/adapter-postgres/src/entry-transition-method.ts';
const fields = 'packages/adapter-postgres/src/entry-detail.ts';
const apiSuite = 'packages/api/src/entry-inspection.test.ts';
const repositorySuite =
  'packages/adapter-postgres/src/entry-inspection.integration.test.ts';
const inspectionGuard =
  "if (!ctx.permissions.has('entry:inspect')) throw new Error('Forbidden');";
const mutations = [
  [
    'API accepts write instead of inspect',
    api,
    "requireMember(c.req.raw, 'entry:inspect')",
    "requireMember(c.req.raw, 'entry:write')",
    apiSuite,
  ],
  [
    'API accepts read instead of inspect',
    api,
    "'entry:inspect'",
    "'entry:read'",
    apiSuite,
  ],
  [
    'repository inspection guard removed',
    repository,
    inspectionGuard,
    '',
    repositorySuite,
  ],
  [
    'repository accepts write instead of inspect',
    repository,
    "has('entry:inspect')",
    "has('entry:write')",
    repositorySuite,
  ],
  [
    'repository accepts write as fallback',
    repository,
    "!ctx.permissions.has('entry:inspect')",
    "!ctx.permissions.has('entry:inspect') && !ctx.permissions.has('entry:write')",
    repositorySuite,
  ],
  [
    'workflow write guard removed',
    workflow,
    "if (!ctx.permissions.has('entry:write')) throw new Error('Forbidden');",
    '',
    repositorySuite,
  ],
  [
    'driver field guard removed',
    fields,
    '      requireWrite(ctx);',
    '',
    repositorySuite,
  ],
  [
    'vehicle field guard removed',
    fields,
    /updateVehicle: async ([\s\S]*?)requireWrite\(ctx\);/,
    'updateVehicle: async $1',
    repositorySuite,
  ],
];
function run(suite) {
  return spawnSync('npx', ['vitest', 'run', suite, '--no-file-parallelism'], {
    encoding: 'utf8',
    env: process.env,
  });
}
for (const suite of [apiSuite, repositorySuite]) {
  const baseline = run(suite);
  if (baseline.status !== 0) throw new Error(baseline.stdout + baseline.stderr);
}
for (const [label, path, search, replacement, suite] of mutations) {
  const original = readFileSync(path, 'utf8');
  const changed = original.replace(search, replacement);
  if (original === changed)
    throw new Error('Mutation no longer matches: ' + label);
  try {
    writeFileSync(path, changed);
    const result = run(suite);
    if (result.status === 0 || result.status === null)
      throw new Error('SURVIVED: ' + label);
    if (!/AssertionError|FAIL/.test(result.stdout + result.stderr))
      throw new Error('No assertion evidence: ' + label);
    console.log('RED as required: ' + label);
  } finally {
    writeFileSync(path, original);
  }
}
