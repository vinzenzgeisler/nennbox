import { run } from 'graphile-worker';
import { and, eq } from 'drizzle-orm';
import { createDatabase, organizations } from '@nennbox/adapter-postgres';
import { createSmtpMailProvider } from '@nennbox/adapter-smtp';
import {
  createStripePaymentProvider,
  resolveStripeSecretFiles,
} from '@nennbox/adapter-stripe';
import { validateMailConfig } from '@nennbox/contracts';
import { staticCanonicalOrigin } from '@nennbox/core';
import { createProductWorker, type ProductWorkerEdition } from './product.js';
import { readStorageConfiguration } from './community-storage.js';
import { parseRegistrationUploadRetentionDays } from './registration-upload-cleanup.js';

const env = process.env;
if (
  env.TEAM_INVITATION_TOKEN_KEY &&
  !/^[a-f0-9]{64}$/i.test(env.TEAM_INVITATION_TOKEN_KEY)
)
  throw new Error('Invalid TEAM_INVITATION_TOKEN_KEY');
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const mode = env.DEPLOYMENT_MODE;
if (mode !== 'community' && mode !== 'cloud')
  throw new Error('Invalid DEPLOYMENT_MODE');
const mailConfig = validateMailConfig(env);
const canonicalBaseUrl = mailConfig.CANONICAL_BASE_URL;
const smtpTimeoutMs = 30_000;
const leaseMs = Number(env.MAIL_OUTBOX_LEASE_MS ?? 300_000);
if (!Number.isSafeInteger(leaseMs) || leaseMs <= smtpTimeoutMs * 3)
  throw new Error('MAIL_OUTBOX_LEASE_MS must be greater than the SMTP timeout');
const smtp =
  mailConfig.MAIL_PROVIDER === 'smtp' && canonicalBaseUrl
    ? createSmtpMailProvider({
        host: mailConfig.SMTP_HOST ?? '',
        port: mailConfig.SMTP_PORT ?? 0,
        secure: mailConfig.SMTP_SECURE === 'true',
        from: mailConfig.SMTP_FROM ?? '',
        ...(mailConfig.SMTP_USER
          ? {
              user: mailConfig.SMTP_USER,
              password: mailConfig.SMTP_PASSWORD ?? '',
            }
          : {}),
      })
    : undefined;
console.info(
  `Mail delivery capability: ${smtp ? 'enabled' : 'disabled (SMTP or CANONICAL_BASE_URL is not fully configured)'}`,
);
const stripeEnv = resolveStripeSecretFiles(env);
if (
  Boolean(stripeEnv.STRIPE_SECRET_KEY) !==
  Boolean(stripeEnv.STRIPE_WEBHOOK_SECRET)
)
  throw new Error(
    'Invalid configuration variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET',
  );
// Single-account provider: Community only. Cloud supplies an account-aware provider.
const paymentProvider =
  mode === 'community' &&
  stripeEnv.STRIPE_SECRET_KEY &&
  stripeEnv.STRIPE_WEBHOOK_SECRET
    ? createStripePaymentProvider({
        secretKey: stripeEnv.STRIPE_SECRET_KEY,
        webhookSecret: stripeEnv.STRIPE_WEBHOOK_SECRET,
        ...(stripeEnv.STRIPE_API_BASE_URL
          ? { apiBaseUrl: stripeEnv.STRIPE_API_BASE_URL }
          : {}),
      })
    : undefined;
const refundRetryAfterMs = Number(env.PAYMENT_REFUND_RETRY_AFTER_MS ?? 600_000);
if (!Number.isSafeInteger(refundRetryAfterMs) || refundRetryAfterMs < 60_000)
  throw new Error(
    'PAYMENT_REFUND_RETRY_AFTER_MS must be at least 60000 milliseconds',
  );
const { db, pool } = await createDatabase(databaseUrl);
const storage = readStorageConfiguration(env);

async function readEdition(): Promise<ProductWorkerEdition> {
  if (mode === 'cloud') return { deploymentMode: 'cloud' };
  const slug = env.COMMUNITY_ORGANIZATION_SLUG;
  if (!slug) throw new Error('COMMUNITY_ORGANIZATION_SLUG is required');
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), eq(organizations.status, 'active')),
    );
  if (!organization)
    throw new Error('Configured community organization is unavailable');
  return { deploymentMode: 'community', organizationId: organization.id };
}

const { taskList } = createProductWorker({
  db,
  edition: await readEdition(),
  ...(storage ? { storage } : {}),
  ...(paymentProvider
    ? { payments: { provider: paymentProvider, refundRetryAfterMs } }
    : {}),
  registrationUploadRetentionDays: parseRegistrationUploadRetentionDays(
    env.REGISTRATION_UPLOAD_RETENTION_DAYS,
  ),
  ...(smtp && canonicalBaseUrl
    ? {
        mail: {
          provider: smtp,
          canonicalOrigin: staticCanonicalOrigin(canonicalBaseUrl),
          leaseMs,
          ...(env.TEAM_INVITATION_TOKEN_KEY
            ? { invitationTokenKey: env.TEAM_INVITATION_TOKEN_KEY }
            : {}),
        },
      }
    : {}),
  onRejected: (task, reason) => console.warn(`Rejected job ${task}: ${reason}`),
});
const crontab = [
  ...(storage ? ['*/5 * * * * registration_upload_cleanup'] : []),
  '* * * * * waitlist_deadlines',
  ...(paymentProvider ? ['*/5 * * * * payment_refund_retry'] : []),
];
const runner = await run({
  connectionString: databaseUrl,
  taskList,
  crontab: crontab.join('\n'),
});
const stop = async () => {
  await runner.stop();
  await pool.end();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
