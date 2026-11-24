import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrate } from './database-service.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const migrationsFolder = new URL('../migrations', import.meta.url).pathname;

/** A throw-away database on the test server, so the schema can be built step by step. */
async function withDatabase<T>(run: (databaseUrl: string) => Promise<T>) {
  const name = `nb_mig_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database ${name}`);
  const databaseUrl = new URL(url!);
  databaseUrl.pathname = `/${name}`;
  try {
    return await run(databaseUrl.toString());
  } finally {
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
}

/** The migrations up to and including `tag`, as an older release would have shipped them. */
function migrationsUpTo(tag: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'nennbox-migrations-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  if (last < 0) throw new Error(`Unknown migration ${tag}`);
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe.skipIf(!url)('migrations (PostgreSQL)', () => {
  it('serializes parallel migrations of one database instead of racing', async () => {
    await withDatabase(async (databaseUrl) => {
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => migrate(databaseUrl)),
      );
      expect(
        results.filter((result) => result.status === 'rejected'),
        JSON.stringify(results),
      ).toHaveLength(0);
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      const applied = await client.query(
        'select count(*)::int as n from drizzle.__drizzle_migrations',
      );
      const expected = (
        JSON.parse(
          readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
        ) as { entries: unknown[] }
      ).entries.length;
      await client.end();
      expect(applied.rows[0].n).toBe(expected);
    });
  });

  it('backfills the payment method and keeps old checkout sessions replaceable when upgrading from 0041', async () => {
    await withDatabase(async (databaseUrl) => {
      await migrate(databaseUrl, {
        migrationsFolder: migrationsUpTo('0041_invoice_paid_at'),
      });
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        const one = async (text: string, values: unknown[] = []) =>
          (await client.query(text, values)).rows[0];
        const org = await one(
          `insert into organization (slug, name, timezone, locale, currency) values ('legacy', 'Legacy', 'UTC', 'de', 'EUR') returning id`,
        );
        const event = await one(
          `insert into event (organization_id, slug, name, starts_on, ends_on, status) values ($1, 'e', 'E', '2030-01-01', '2030-01-01', 'open') returning id`,
          [org.id],
        );
        const person = await one(
          `insert into person (organization_id, first_name, last_name) values ($1, 'A', 'B') returning id`,
          [org.id],
        );
        const group = await one(
          `insert into registration_group (organization_id, event_id, person_id) values ($1, $2, $3) returning id`,
          [org.id, event.id, person.id],
        );
        const invoice = await one(
          `insert into invoice (organization_id, event_id, registration_group_id, total_cents, currency, payment_reference) values ($1, $2, $3, 4200, 'EUR', 'RF-LEGACY') returning id`,
          [org.id, event.id, group.id],
        );
        const ledger = async (
          amount: number,
          actor: string,
          providerPaymentId: string | null,
          providerRefundId: string | null,
        ) =>
          client.query(
            `insert into invoice_payment (organization_id, invoice_id, amount_cents, actor, reason, provider_payment_id, provider_refund_id) values ($1, $2, $3, $4, 'legacy', $5, $6)`,
            [
              org.id,
              invoice.id,
              amount,
              actor,
              providerPaymentId,
              providerRefundId,
            ],
          );
        await ledger(1000, 'office', null, null);
        await ledger(3000, 'stripe:webhook', 'pi_legacy', null);
        await ledger(-500, 'admin', 'pi_legacy', 're_legacy');
        await client.query(
          `insert into payment_checkout_session (organization_id, invoice_id, provider, provider_session_id, url) values ($1, $2, 'stripe', 'cs_legacy', 'https://checkout.test/legacy')`,
          [org.id, invoice.id],
        );
        await client.query(
          `insert into email_outbox (organization_id, template_key, template_version, locale, recipient, idempotency_key, variables) values ($1, 'driver-portal-link', 1, 'de', 'a@example.test', 'legacy-mail', '{}')`,
          [org.id],
        );
        await client.end();

        // Upgrade to the current schema.
        await migrate(databaseUrl);

        const after = new pg.Client({ connectionString: databaseUrl });
        await after.connect();
        try {
          const methods = (
            await after.query(
              `select amount_cents, method from invoice_payment order by amount_cents`,
            )
          ).rows;
          expect(methods).toEqual([
            { amount_cents: -500, method: 'online' },
            { amount_cents: 1000, method: 'manual' },
            { amount_cents: 3000, method: 'online' },
          ]);
          const session = (
            await after.query(
              `select status, amount_cents, payment_methods, expires_at from payment_checkout_session`,
            )
          ).rows[0];
          // Old sessions stay pending with unknown amount and methods, so checkout replaces them.
          expect(session).toEqual({
            status: 'checkout_pending',
            amount_cents: null,
            payment_methods: null,
            expires_at: null,
          });
          // The new template key is accepted next to the old ones.
          await after.query(
            `insert into email_outbox (organization_id, template_key, template_version, locale, recipient, idempotency_key, variables) values ($1, 'payment-received', 1, 'de', 'a@example.test', 'new-mail', '{}')`,
            [org.id],
          );
          // Terminal checkout state is kept by the trigger.
          await after.query(
            `update payment_checkout_session set status = 'paid'`,
          );
          await after.query(
            `update payment_checkout_session set status = 'expired'`,
          );
          expect(
            (await after.query(`select status from payment_checkout_session`))
              .rows[0].status,
          ).toBe('paid');
        } finally {
          await after.end();
        }
      } finally {
        await client.end().catch(() => undefined);
      }
    });
  });
});
