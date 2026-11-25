import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveStripeSecretFiles } from '@nennbox/adapter-stripe';
import { loadConfig } from './config.js';

const base = {
  DEPLOYMENT_MODE: 'community',
  DATABASE_URL: 'postgres://nennbox:secret@localhost:5432/nennbox',
  COMMUNITY_ORGANIZATION_SLUG: 'verein',
  COMMUNITY_ORGANIZATION_NAME: 'Verein',
  COMMUNITY_ORGANIZATION_TIMEZONE: 'Europe/Berlin',
  COMMUNITY_ORGANIZATION_LOCALE: 'de-DE',
};

function secretFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'nennbox-secret-'));
  const path = join(dir, 'secret');
  writeFileSync(path, content);
  return path;
}

describe('Stripe secrets from files', () => {
  it('reads both secrets from files and trims the trailing newline', () => {
    const config = loadConfig({
      ...base,
      STRIPE_SECRET_KEY_FILE: secretFile('sk_test_from_file\n'),
      STRIPE_WEBHOOK_SECRET_FILE: secretFile('whsec_from_file\n'),
    });
    expect(config.STRIPE_SECRET_KEY).toBe('sk_test_from_file');
    expect(config.STRIPE_WEBHOOK_SECRET).toBe('whsec_from_file');
  });

  it('still accepts the plain environment variables', () => {
    const config = loadConfig({
      ...base,
      STRIPE_SECRET_KEY: 'sk_test_env',
      STRIPE_WEBHOOK_SECRET: 'whsec_env',
    });
    expect(config.STRIPE_SECRET_KEY).toBe('sk_test_env');
  });

  it('rejects a secret given both ways and an unreadable file, naming the variable but not the value', () => {
    expect(() =>
      resolveStripeSecretFiles({
        STRIPE_SECRET_KEY: 'sk_test_env',
        STRIPE_SECRET_KEY_FILE: secretFile('sk_test_file'),
      }),
    ).toThrow('STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_FILE');
    expect(() =>
      loadConfig({ ...base, STRIPE_SECRET_KEY_FILE: '/nonexistent/secret' }),
    ).toThrow('STRIPE_SECRET_KEY_FILE');
  });

  it('treats an empty or whitespace-only secret file as a configuration error, not as "payments off"', () => {
    for (const content of ['', ' \n'])
      expect(() =>
        loadConfig({
          ...base,
          STRIPE_SECRET_KEY_FILE: secretFile(content),
          STRIPE_WEBHOOK_SECRET_FILE: secretFile('whsec_from_file'),
        }),
      ).toThrow('STRIPE_SECRET_KEY_FILE');
  });

  it('refuses a key without its webhook secret', () => {
    expect(() =>
      loadConfig({ ...base, STRIPE_SECRET_KEY: 'sk_test_only' }),
    ).toThrow('STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET');
  });
});
