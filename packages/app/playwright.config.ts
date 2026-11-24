import { defineConfig } from '@playwright/test';

// Specs share one seeded stack and run in parallel workers. Specs that delete shared rows are
// named `*.destructive.spec.ts` and run in a second project that starts after all others finish.
const destructive = /.*\.destructive\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL:
      process.env.NENNBOX_APP_URL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://127.0.0.1:5173',
    browserName: 'chromium',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'shared-data', testIgnore: destructive },
    {
      name: 'destructive',
      testMatch: destructive,
      dependencies: ['shared-data'],
    },
  ],
  reporter: [['list']],
  timeout: 30_000,
});
