import { PublicRegistrationResponseSchema } from '@nennbox/contracts';
import {
  createRequestContext,
  organizationId,
  staticCanonicalOrigin,
} from '@nennbox/core';
import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createPublicRegistrationService,
  entries,
  eventClasses,
  events,
  organizations,
  publicEntrySubmissions,
} from './index.js';
import {
  eventClassPricingRules,
  organizationPaymentRecipients,
} from './schema/billing.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;
const termHash = createHash('sha256').update('Terms').digest('hex');

describe.skipIf(!url)('public registration submission outcomes', () => {
  it('returns request-ordered mixed outcomes, class-local positions, invoice details and the original replay', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    try {
      const [org] = await db
        .insert(organizations)
        .values({
          slug: `submission-outcomes-${suffix}`,
          name: 'Submission outcomes',
          timezone: 'UTC',
          locale: 'de',
        })
        .returning();
      const [event] = await db
        .insert(events)
        .values({
          organizationId: org!.id,
          slug: 'outcomes',
          name: 'Outcomes',
          startsOn: '2030-06-01',
          endsOn: '2030-06-02',
          status: 'open',
          consentTerms: [
            {
              key: 'terms',
              version: '1',
              language: 'de',
              text: 'Terms',
              hash: termHash,
              required: true,
            },
          ],
        })
        .returning();
      const classes = await db
        .insert(eventClasses)
        .values(
          ['A', 'B', 'C'].map((code) => ({
            organizationId: org!.id,
            eventId: event!.id,
            code,
            name: code,
            vehicleType: 'car' as const,
            maxParticipants: 1,
          })),
        )
        .returning();
      const [a, b, c] = classes;
      await db.insert(eventClassPricingRules).values(
        classes.map((klass) => ({
          organizationId: org!.id,
          eventId: event!.id,
          classId: klass.id,
          baseCents: 1000,
        })),
      );
      await db.insert(organizationPaymentRecipients).values({
        organizationId: org!.id,
        accountName: 'Test club',
        iban: 'DE89370400440532013000',
      });
      const service = createPublicRegistrationService(db, {
        canonicalOrigin: staticCanonicalOrigin(
          'https://registration.example.test',
        ),
      });
      const ctx = createRequestContext({
        deploymentMode: 'cloud',
        organizationId: organizationId(org!.id),
        permissions: new Set(),
        capabilities: new Set(),
        correlationId: suffix,
      });
      const request = (name: string, classIds: string[]) => ({
        submissionId: crypto.randomUUID(),
        formVersion: '1.0' as const,
        eventSlug: event!.slug,
        language: 'de' as const,
        person: {
          firstName: name,
          lastName: 'Driver',
          dateOfBirth: '1990-01-01',
          email: `${name}@example.test`,
        },
        entries: classIds.map((classId, index) => ({
          classId,
          vehicle: {
            make: 'Test',
            model: `${name}-${index}`,
            year: 2000,
            registration: null,
          },
        })),
        consents: [
          {
            key: 'terms',
            version: '1',
            hash: termHash,
            accepted: true as const,
          },
        ],
      });
      await service.submit(ctx, event!.slug, request('seed-a', [a!.id, a!.id]));
      await service.submit(
        ctx,
        event!.slug,
        request('seed-b', [b!.id, b!.id, b!.id]),
      );
      const payload = request('mixed', [a!.id, c!.id, b!.id, a!.id, b!.id]);
      const response = await service.submit(ctx, event!.slug, payload);
      expect(PublicRegistrationResponseSchema.parse(response)).toEqual(
        response,
      );
      expect(response).toMatchObject({
        accepted: true,
        entryCount: 5,
        invoiceId: expect.any(String),
        paymentInstructions: {
          accountName: 'Test club',
          iban: 'DE89370400440532013000',
          bic: null,
          paymentReference: expect.any(String),
          amountCents: 5000,
          currency: 'EUR',
        },
      });
      expect(response.entries).toEqual([
        {
          entryId: expect.any(String),
          status: 'waitlisted',
          waitlistPosition: 2,
        },
        {
          entryId: expect.any(String),
          status: 'pending',
          waitlistPosition: null,
        },
        {
          entryId: expect.any(String),
          status: 'waitlisted',
          waitlistPosition: 3,
        },
        {
          entryId: expect.any(String),
          status: 'waitlisted',
          waitlistPosition: 3,
        },
        {
          entryId: expect.any(String),
          status: 'waitlisted',
          waitlistPosition: 4,
        },
      ]);
      const ids = response.entries.map((entry) => entry.entryId);
      expect(new Set(ids).size).toBe(5);
      const storedEntries = await db
        .select()
        .from(entries)
        .where(inArray(entries.id, ids));
      for (const [index, outcome] of response.entries.entries()) {
        const stored = storedEntries.find(
          (entry) => entry.id === outcome.entryId,
        )!;
        expect(stored.classId).toBe(payload.entries[index]!.classId);
        expect(stored.acceptanceStatus).toBe(outcome.status);
        expect(stored.waitlistPosition).toBe(outcome.waitlistPosition);
      }
      const [submission] = await db
        .select()
        .from(publicEntrySubmissions)
        .where(eq(publicEntrySubmissions.submissionId, payload.submissionId));
      expect(submission!.response).toEqual(response);

      // Replay returns the persisted outcome, even after workflow/configuration changes.
      await db
        .update(entries)
        .set({
          acceptanceStatus: 'accepted',
          waitlistPosition: null,
        })
        .where(inArray(entries.id, ids));
      await db
        .update(events)
        .set({ status: 'closed' })
        .where(eq(events.id, event!.id));
      await db
        .update(organizationPaymentRecipients)
        .set({ accountName: 'Changed club' })
        .where(eq(organizationPaymentRecipients.organizationId, org!.id));
      const replays = await Promise.all([
        service.submit(ctx, event!.slug, payload),
        service.submit(ctx, event!.slug, payload),
      ]);
      expect(replays).toEqual([response, response]);
      expect(
        await db
          .select()
          .from(entries)
          .where(eq(entries.organizationId, org!.id)),
      ).toHaveLength(10);
    } finally {
      await pool.end();
    }
  });
});
