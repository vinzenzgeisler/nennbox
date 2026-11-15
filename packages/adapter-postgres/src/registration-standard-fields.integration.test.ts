import {
  defaultRegistrationFormConfig,
  mergeRegistrationFormConfig,
} from '@racepilot/contracts';
import { staticCanonicalOrigin } from '@racepilot/core';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { createRequestContext, organizationId } from '@racepilot/core';
import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEntryRepository,
  createPublicRegistrationService,
  emailOutbox,
  events,
  eventClasses,
  organizations,
  people,
  registrationGroups,
  vehicles,
} from './index.js';

const url = process.env.RACEPILOT_TEST_DATABASE_URL;
const text = 'Wortlaut: Ich stimme zu.';
const hash = createHash('sha256').update(text).digest('hex');
const context = (orgId: string, permissions: string[] = []) =>
  createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(orgId),
    permissions: new Set(permissions),
    capabilities: new Set(),
    correlationId: 'standard-fields',
  });

const person = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Anna',
  lastName: 'Rennfahrerin',
  dateOfBirth: '1990-05-05',
  email: 'anna@example.test',
  bloodGroup: '0-',
  licenseNumber: 'DMSB-4711',
  ...overrides,
});
const vehicle = (overrides: Record<string, unknown> = {}) => ({
  make: 'NSU',
  model: 'TT',
  year: 1969,
  registration: null,
  transponderNumber: 'T-9',
  vehiclePassNumber: 'FP-123',
  ...overrides,
});

describe.skipIf(!url)('typed standard fields', () => {
  it('delivers, validates and stores the configured fields per event and organization', async () => {
    await runMigrations({ connectionString: url! });
    const { db, pool } = await createDatabase(url!);
    const suffix = crypto.randomUUID();
    const orgIds: string[] = [];
    try {
      const mkOrg = async (
        key: string,
        registrationFormConfig: Record<string, unknown> | null = null,
      ) => {
        const [org] = await db
          .insert(organizations)
          .values({
            slug: `${key}-${suffix}`,
            name: key,
            timezone: 'UTC',
            locale: 'de',
            registrationFormConfig,
          })
          .returning();
        orgIds.push(org!.id);
        return org!;
      };
      const mkEvent = async (
        orgId: string,
        slug: string,
        config: Record<string, unknown> | null,
      ) => {
        const [event] = await db
          .insert(events)
          .values({
            organizationId: orgId,
            slug: `${slug}-${suffix}`,
            name: slug,
            startsOn: '2030-06-01',
            endsOn: '2030-06-02',
            status: 'open',
            registrationFormConfig: config,
            consentTerms: [
              {
                key: 'participation',
                version: '1',
                language: 'de' as const,
                text,
                hash,
                required: true,
              },
            ],
          })
          .returning();
        const [klass] = await db
          .insert(eventClasses)
          .values({
            organizationId: orgId,
            eventId: event!.id,
            name: 'Klasse M',
            code: 'M',
            vehicleType: 'motorcycle',
            maxParticipants: 50,
          })
          .returning();
        return { event: event!, klass: klass! };
      };
      const service = createPublicRegistrationService(db, {
        canonicalOrigin: staticCanonicalOrigin('https://entries.example.test'),
      });
      const request = (
        target: Awaited<ReturnType<typeof mkEvent>>,
        personPatch: Record<string, unknown> = {},
        vehiclePatch: Record<string, unknown> = {},
      ) => ({
        submissionId: crypto.randomUUID(),
        formVersion: '1.0' as const,
        language: 'de' as const,
        eventSlug: target.event.slug,
        person: person(personPatch),
        entries: [{ classId: target.klass.id, vehicle: vehicle(vehiclePatch) }],
        consents: [
          {
            key: 'participation',
            version: '1',
            hash,
            accepted: true as const,
          },
        ],
      });
      const detail = async (orgId: string, eventId: string) =>
        (
          await createEntryRepository(db).listAdmin!(
            context(orgId, ['entry:read']),
            {
              page: 1,
              pageSize: 50,
              eventId,
              sort: 'createdAt',
              direction: 'asc',
            },
          )
        ).items;

      // Organization A requires the blood group for all its events by default.
      const orgA = await mkOrg('a', {
        fields: { bloodGroup: { state: 'required' } },
      });
      const orgB = await mkOrg('b');
      const ctxA = context(orgA.id);
      const ctxB = context(orgB.id);
      // Inherits the organization default.
      const inherited = await mkEvent(orgA.id, 'inherited', {
        fields: { licenseNumber: { state: 'required' } },
      });
      // Event overrides the organization default and relaxes the birth date.
      const relaxed = await mkEvent(orgA.id, 'relaxed', {
        fields: {
          bloodGroup: { state: 'optional' },
          dateOfBirth: { state: 'hidden' },
          licenseNumber: { state: 'hidden' },
          transponderNumber: { state: 'required' },
          vehiclePassNumber: { state: 'hidden' },
        },
      });
      // Old form: nothing configured, so the newer fields are not asked.
      const legacy = await mkEvent(orgB.id, 'legacy', null);

      // The public route completes the stored configuration with the product defaults
      // (registration-assets.ts); the server rules resolve the same way.
      const delivered = async (
        ctx: typeof ctxA,
        target: { event: { slug: string } },
      ) =>
        mergeRegistrationFormConfig(
          defaultRegistrationFormConfig,
          (await service.getForm(ctx, target.event.slug))
            ?.registrationFormConfig as never,
        ).fields;
      expect(await delivered(ctxA, inherited)).toMatchObject({
        bloodGroup: { state: 'required' },
        licenseNumber: { state: 'required' },
        transponderNumber: { state: 'hidden' },
        dateOfBirth: { state: 'required' },
      });
      expect(await delivered(ctxB, legacy)).toMatchObject({
        bloodGroup: { state: 'hidden' },
        licenseNumber: { state: 'hidden' },
        dateOfBirth: { state: 'required' },
      });
      // Another organization's event slug is not resolvable with this organization.
      expect(await service.getForm(ctxB, inherited.event.slug)).toBeNull();

      const refusals: Array<[string, ReturnType<typeof request>]> = [
        [
          'org default: blood group required but missing',
          request(inherited, { bloodGroup: null }, { transponderNumber: null }),
        ],
        [
          'licence required by the event but missing',
          request(
            inherited,
            { licenseNumber: null },
            { transponderNumber: null, vehiclePassNumber: null },
          ),
        ],
        [
          'transponder hidden but given',
          request(inherited, {}, { vehiclePassNumber: null }),
        ],
        [
          'vehicle pass hidden on this event but given',
          request(
            inherited,
            { licenseNumber: 'L-1' },
            {
              transponderNumber: null,
            },
          ),
        ],
        [
          'transponder required but missing',
          request(
            relaxed,
            { dateOfBirth: null, licenseNumber: null },
            { transponderNumber: null, vehiclePassNumber: null },
          ),
        ],
        [
          'date of birth hidden but given',
          request(
            relaxed,
            { licenseNumber: null },
            { vehiclePassNumber: null },
          ),
        ],
        [
          'old form: blood group hidden but given',
          request(
            legacy,
            { licenseNumber: null },
            {
              transponderNumber: null,
              vehiclePassNumber: null,
            },
          ),
        ],
        [
          'old form: date of birth still required',
          request(
            legacy,
            { dateOfBirth: null, bloodGroup: null, licenseNumber: null },
            { transponderNumber: null, vehiclePassNumber: null },
          ),
        ],
      ];
      for (const [label, payload] of refusals)
        await expect(
          service.submit(
            payload.eventSlug.startsWith('legacy') ? ctxB : ctxA,
            payload.eventSlug,
            payload as never,
          ),
          label,
        ).rejects.toThrow('Registration unavailable');
      expect(await detail(orgA.id, inherited.event.id)).toHaveLength(0);
      expect(await detail(orgA.id, relaxed.event.id)).toHaveLength(0);
      expect(await detail(orgB.id, legacy.event.id)).toHaveLength(0);

      // Everything the event asks for is stored and shown in the admin detail.
      await service.submit(
        ctxA,
        inherited.event.slug,
        request(
          inherited,
          { bloodGroup: 'AB+', licenseNumber: 'DMSB-4711' },
          { transponderNumber: null, vehiclePassNumber: null },
        ) as never,
      );
      // The relaxed event takes no birth date and no licence; the blood group is optional.
      await service.submit(
        ctxA,
        relaxed.event.slug,
        request(
          relaxed,
          { dateOfBirth: null, bloodGroup: null, licenseNumber: null },
          { vehiclePassNumber: null, transponderNumber: 'T-77' },
        ) as never,
      );
      // The old form still works exactly as before.
      await service.submit(
        ctxB,
        legacy.event.slug,
        request(
          legacy,
          { bloodGroup: null, licenseNumber: null },
          { transponderNumber: null, vehiclePassNumber: null },
        ) as never,
      );

      const [inheritedEntry] = await detail(orgA.id, inherited.event.id);
      expect(inheritedEntry?.adminDetails?.driver).toMatchObject({
        bloodGroup: 'AB+',
        licenseNumber: 'DMSB-4711',
        dateOfBirth: '1990-05-05',
      });
      const [relaxedEntry] = await detail(orgA.id, relaxed.event.id);
      expect(relaxedEntry?.adminDetails?.driver).toMatchObject({
        bloodGroup: null,
        licenseNumber: null,
        dateOfBirth: null,
      });
      expect(relaxedEntry?.adminDetails?.vehicle).toMatchObject({
        transponderNumber: 'T-77',
        vehiclePassNumber: null,
      });
      const [legacyEntry] = await detail(orgB.id, legacy.event.id);
      expect(legacyEntry?.adminDetails?.driver).toMatchObject({
        bloodGroup: null,
        dateOfBirth: '1990-05-05',
      });

      // Organization B sees nothing of organization A, and the values sit on the
      // registration and the vehicle, never on the organization-wide person.
      expect(await detail(orgB.id, inherited.event.id)).toHaveLength(0);
      expect(await detail(orgA.id, legacy.event.id)).toHaveLength(0);
      const personRows = await db
        .select()
        .from(people)
        .where(eq(people.organizationId, orgA.id));
      expect(Object.keys(personRows[0]!)).not.toContain('bloodGroup');
      expect(personRows.some((row) => row.dateOfBirth === null)).toBe(true);
      const groups = await db
        .select()
        .from(registrationGroups)
        .where(eq(registrationGroups.organizationId, orgB.id));
      expect(groups.map((group) => group.bloodGroup)).toEqual([null]);
      expect(
        (
          await db
            .select()
            .from(vehicles)
            .where(eq(vehicles.organizationId, orgB.id))
        ).map((row) => row.transponderNumber),
      ).toEqual([null]);

      // A draft saved with the new fields resumes with them.
      const draft = {
        firstName: 'Anna',
        lastName: 'Rennfahrerin',
        email: 'draft@example.test',
        dateOfBirth: '1990-05-05',
        guardianName: '',
        guardianEmail: '',
        bloodGroup: '0+',
        licenseNumber: 'L-9',
        vehicles: [
          {
            classId: inherited.klass.id,
            make: 'NSU',
            model: 'TT',
            year: '1969',
            registration: '',
            requestedStartNumber: '',
            transponderNumber: 'T-1',
            vehiclePassNumber: 'FP-1',
          },
        ],
        accepted: {},
        customAnswers: {},
      };
      await service.saveDraft(
        ctxA,
        inherited.event.slug,
        draft.email,
        'de',
        draft as never,
      );
      const message = (
        await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.recipient, draft.email))
      )[0]!;
      const token = new URL(message.variables.resumeUrl!).hash.slice(
        '#token='.length,
      );
      expect((await service.resumeDraft(ctxA, token))?.draft).toMatchObject({
        bloodGroup: '0+',
        licenseNumber: 'L-9',
        vehicles: [{ transponderNumber: 'T-1', vehiclePassNumber: 'FP-1' }],
      });
    } finally {
      for (const orgId of orgIds) {
        const mails = await db
          .select({ id: emailOutbox.id })
          .from(emailOutbox)
          .where(eq(emailOutbox.organizationId, orgId));
        for (const mail of mails)
          await db.execute(
            sql`select graphile_worker.remove_job(${`mail-outbox:${mail.id}`})`,
          );
        await db
          .delete(emailOutbox)
          .where(eq(emailOutbox.organizationId, orgId));
        await db.delete(events).where(eq(events.organizationId, orgId));
        await db.delete(organizations).where(eq(organizations.id, orgId));
      }
      await pool.end();
    }
  });
});
