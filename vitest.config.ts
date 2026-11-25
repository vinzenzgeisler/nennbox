import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
const source = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against package sources so they do not depend on a prior build.
    alias: {
      '@nennbox/core': source('core'),
      '@nennbox/ui/registration-preview.css': fileURLToPath(
        new URL('./packages/ui/src/registration/preview.css', import.meta.url),
      ),
      '@nennbox/ui': source('ui'),
      '@nennbox/contracts': source('contracts'),
      '@nennbox/adapter-postgres': source('adapter-postgres'),
      '@nennbox/adapter-stripe': source('adapter-stripe'),
      '@nennbox/adapter-local-storage': source('adapter-local-storage'),
      '@nennbox/artifacts/pdf': fileURLToPath(
        new URL('./packages/artifacts/src/pdf.ts', import.meta.url),
      ),
    },
  },
  test: {
    maxWorkers: 4,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
