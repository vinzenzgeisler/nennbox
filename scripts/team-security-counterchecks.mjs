import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!process.env.NENNBOX_TEST_DATABASE_URL)
  throw new Error('NENNBOX_TEST_DATABASE_URL required');
const team = 'packages/adapter-postgres/src/team.ts';
const support = 'packages/adapter-postgres/src/team-support.ts';
const memberships = 'packages/adapter-postgres/src/memberships.ts';
const suite = 'packages/adapter-postgres/src/team.integration.test.ts';
const source = new Map(
  [team, support, memberships].map((path) => [
    path,
    readFileSync(path, 'utf8'),
  ]),
);
const mutations = [
  ['expiry', team, /invitation\.expiresAt <= new Date\(\)/, 'false'],
  ['revocation', team, /invitation\.revokedAt \|\|/, ''],
  ['single use', team, /invitation\.redeemedAt \|\|/, ''],
  [
    'email binding',
    team,
    /invitation\.email !== identity\.email\.trim\(\)\.toLowerCase\(\) \|\|/,
    '',
  ],
  ['verified email', team, /!identity\.emailVerified \|\|/, ''],
  [
    'subject binding',
    team,
    /ctx\.subject\.subject !== identity\.subject \|\|/,
    '',
  ],
  [
    'issuer binding',
    team,
    /ctx\.subject\.issuer !== identity\.issuer \|\|/,
    '',
  ],
  [
    'existing membership protection',
    team,
    /if \(existing\) return fail\('conflict'\);/,
    '',
  ],
  [
    'last administrator',
    team,
    /if \(admins\.length <= 1\) return fail\('conflict'\);/,
    '',
  ],
  [
    'fresh administrator authority',
    support,
    /if \(!rows\.length\) return teamFailure\('forbidden'\);/,
    '',
  ],
  [
    'invitation tenant scope',
    support,
    /eq\(teamInvitations\.organizationId, ctx\.organizationId\)/g,
    'eq(teamInvitations.organizationId, teamInvitations.organizationId)',
  ],
  [
    'redemption tenant scope',
    team,
    /eq\(teamInvitations\.organizationId, ctx\.organizationId\)/g,
    'eq(teamInvitations.organizationId, teamInvitations.organizationId)',
  ],
  [
    'immediate deactivation',
    memberships,
    /eq\(organizationMemberships\.status, 'active'\)/,
    'eq(organizationMemberships.status, organizationMemberships.status)',
  ],
  ['tenant serialization', support, /await tx\.execute\([\s\S]*?\n {4}\);/, ''],
];
const run = () =>
  spawnSync('npx', ['vitest', 'run', suite, '--no-file-parallelism'], {
    encoding: 'utf8',
    env: process.env,
  });
const baseline = run();
if (baseline.status !== 0)
  throw new Error('Baseline failed: ' + baseline.stdout + baseline.stderr);
try {
  for (const [label, path, pattern, replacement] of mutations) {
    const original = source.get(path);
    const mutated = original.replace(pattern, replacement);
    if (mutated === original)
      throw new Error('Mutation no longer matches: ' + label);
    try {
      writeFileSync(path, mutated);
      const result = run();
      if (result.status === 0 || result.status === null)
        throw new Error('SURVIVED: ' + label);
      if (!/AssertionError|FAIL/.test(result.stdout + result.stderr))
        throw new Error('No assertion evidence: ' + label);
      console.log('RED as required: ' + label);
    } finally {
      writeFileSync(path, original);
    }
  }
} finally {
  for (const [path, original] of source) writeFileSync(path, original);
}
console.log('All team protection counterchecks detected removed guards.');
