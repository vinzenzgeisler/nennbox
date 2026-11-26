import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (!process.env.NENNBOX_TEST_DATABASE_URL)
  throw new Error('NENNBOX_TEST_DATABASE_URL required');
const http = 'packages/api/src/team-review.integration.test.ts';
const discovery = 'packages/api/src/routes/entry-admin-actions.ts';
const email = 'packages/core/src/team-email.ts';
const membership = 'packages/adapter-postgres/src/memberships.ts';
const mutations = [
  [
    'login completion proxy omitted',
    'packages/app/vite.config.ts',
    "  '/auth/session',\n",
    '',
    'scripts/app-auth-routing.test.ts',
  ],
  [
    'message discovery requires event:write again',
    discovery,
    'context.permissions.has(entryActionPermissions.message)',
    "context.permissions.has('event:write')",
    'packages/api/src/entry-detail.test.ts',
  ],
  [
    'IDNA omitted',
    email,
    'new URL(`http://${domain}`).hostname',
    'domain',
    http,
  ],
  [
    'trim omitted',
    email,
    'input.trim().toLowerCase()',
    'input.toLowerCase()',
    http,
  ],
  [
    'Unicode local-part diagnostic removed',
    email,
    "if ([...input.trim().split('@')[0]!].some((char) => char.charCodeAt(0) > 127))",
    'if (false)',
    http,
  ],
  [
    'login timestamp not recorded',
    membership,
    '.set({ lastSignedInAt: new Date() })',
    '.set({ lastSignedInAt: null })',
    http,
  ],
  [
    'login tenant scope removed',
    membership,
    'eq(organizationMemberships.organizationId, orgId)',
    'eq(organizationMemberships.organizationId, organizationMemberships.organizationId)',
    http,
  ],
  [
    'disabled member login permitted',
    membership,
    "eq(organizationMemberships.status, 'active')",
    'eq(organizationMemberships.status, organizationMemberships.status)',
    http,
  ],
  [
    'callback login completion omitted',
    'packages/app/src/auth-oidc.ts',
    'if (isCallback && user && !user.expired)',
    'if (false && isCallback && user && !user.expired)',
    'packages/app/src/auth.test.ts',
  ],
];
const run = (suite) =>
  spawnSync('npx', ['vitest', 'run', suite, '--no-file-parallelism'], {
    encoding: 'utf8',
    env: process.env,
  });
for (const suite of new Set(mutations.map((m) => m[4]))) {
  const result = run(suite);
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
}
for (const [label, path, search, replacement, suite] of mutations) {
  const original = readFileSync(path, 'utf8');
  const changed = original.replace(search, replacement);
  if (changed === original)
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
