import { describe, expect, it } from 'vitest';
import { RegistrationUnavailable, staticCanonicalOrigin } from '@nennbox/core';
import { createDatabase } from './database-service.js';
import { createPublicRegistrationService } from './public-registration-service.js';
import { createStartNumberService } from './start-number-service.js';
import { seedPaths } from './entry-status-path-fixture.js';

const url = process.env.NENNBOX_TEST_DATABASE_URL;

async function withPaths(
  options: Parameters<typeof seedPaths>[3],
  run: (
    s: Awaited<ReturnType<typeof seedPaths>>,
    apply: ReturnType<typeof createPublicRegistrationService>,
    submit: (
      n: number,
    ) => ReturnType<
      ReturnType<typeof createPublicRegistrationService>['submit']
    >,
    pool: Awaited<ReturnType<typeof createDatabase>>['pool'],
    db: Awaited<ReturnType<typeof createDatabase>>['db'],
  ) => Promise<void>,
) {
  const { db, pool } = await createDatabase(url!);
  const s = await seedPaths(db, pool, 'registration-paths', options);
  const service = createPublicRegistrationService(db, {
    canonicalOrigin: staticCanonicalOrigin('https://entries.example.test'),
  });
  const submit = (n: number) =>
    service.submit(s.ctx, s.slug, {
      submissionId: crypto.randomUUID(),
      formVersion: '1.0',
      language: 'de',
      eventSlug: s.slug,
      person: {
        firstName: `Person${n}`,
        lastName: 'Paths',
        dateOfBirth: `199${n % 10}-01-01`,
        email: `p${n}-${crypto.randomUUID()}@example.test`,
      },
      entries: [
        {
          classId: s.klass.id,
          requestedStartNumber: null,
          vehicle: { make: 'T', model: 'C', year: 2000, registration: null },
        },
      ],
      consents: [],
    });
  try {
    await run(s, service, submit, pool, db);
  } finally {
    await s.cleanup();
    await pool.end();
  }
}

describe.skipIf(!url)('public registration capacity by category', () => {
  it.each(['gone-r', 'gone-w'])(
    'a %s entry releases its seat to a new registration',
    (released) =>
      withPaths({}, async (s, _service, submit) => {
        await s.addEntry(released);
        const response = await submit(1);
        expect(response.entries).toMatchObject([
          { status: 'pending', waitlistPosition: null },
        ]);
      }),
  );

  it.each(['withdrawn', 'rejected'])(
    'a status keyed "%s" with category accepted holds its seat',
    (decoy) =>
      withPaths({}, async (s, _service, submit) => {
        await s.addEntry(decoy);
        const response = await submit(2);
        expect(response.entries).toMatchObject([
          { status: 'waitlisted', waitlistPosition: 1 },
        ]);
        const row = await s.row(response.entries[0]!.entryId);
        expect(row).toMatchObject({ status: 'wait-1', category: 'waitlisted' });
      }),
  );

  it('waiters hold a seat only while their offer is open', () =>
    withPaths({}, async (s, _service, submit, pool) => {
      const waiter = await s.addEntry('wait-1', { waitlistPosition: 1 });
      expect((await submit(3)).entries[0]!.status).toBe('pending');
      await pool.query('DELETE FROM entry WHERE class_id=$1', [s.klass.id]);
      const offered = await s.addEntry('wait-1', { waitlistPosition: 1 });
      await pool.query(
        "UPDATE entry SET waitlist_offer_sent_at=now(),waitlist_confirmation_deadline=now()+interval '1 day' WHERE id=$1",
        [offered],
      );
      expect((await submit(4)).entries[0]!.status).toBe('waitlisted');
      expect(waiter).toBeTruthy();
    }));

  it('says so when the class is full and the workflow has no waiting status', () =>
    withPaths({ waitlist: false }, async (s, _service, submit, pool) => {
      await s.addEntry('ok-1');
      await expect(submit(5)).rejects.toThrow(RegistrationUnavailable);
      await expect(submit(6)).rejects.toMatchObject({
        reason: 'waitlist-unavailable',
      });
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM entry WHERE class_id=$1',
            [s.klass.id],
          )
        ).rows[0].n,
      ).toBe(1);
    }));

  it('still accepts registrations while seats are free without a waiting status', () =>
    withPaths({ waitlist: false }, async (s, _service, submit) => {
      expect((await submit(7)).entries[0]!.status).toBe('pending');
    }));
});

describe.skipIf(!url)('start numbers follow the pinned category', () => {
  const configure = (
    db: Awaited<ReturnType<typeof createDatabase>>['db'],
    s: Awaited<ReturnType<typeof seedPaths>>,
    mode: 'automatic' | 'organizer_assigned',
    from: number,
    to: number,
  ) =>
    createStartNumberService(db).configure(
      s.ctx,
      s.event.id,
      [{ classId: s.klass.id, from, to, reserved: [], mode }],
      { automaticPromotion: true, confirmationHours: 48 },
    );

  it.each(['gone-r', 'gone-w'])(
    'a %s entry frees its number for automatic allocation and availability checks',
    (released) =>
      withPaths({ max: null }, async (s, service, submit, _pool, db) => {
        await configure(db, s, 'automatic', 5, 5);
        await s.addEntry(released, { assigned: '5' });
        expect(
          await service.checkRequestedStartNumber(s.ctx, s.slug, '5'),
        ).toEqual({ available: true });
        await submit(1);
        const taken = await service.checkRequestedStartNumber(
          s.ctx,
          s.slug,
          '5',
        );
        expect(taken).toEqual({ available: false });
      }),
  );

  it.each(['withdrawn', 'rejected'])(
    'a status keyed "%s" with category accepted keeps its number',
    (decoy) =>
      withPaths({ max: null }, async (s, service, submit, _pool, db) => {
        await configure(db, s, 'automatic', 5, 5);
        await s.addEntry(decoy, { assigned: '5' });
        expect(
          await service.checkRequestedStartNumber(s.ctx, s.slug, '5'),
        ).toEqual({ available: false });
        await expect(submit(2)).rejects.toMatchObject({
          reason: 'class-unavailable',
        });
      }),
  );

  it('assigns by category and reuses numbers of released entries', () =>
    withPaths({ max: null }, async (s, _service, _submit, _pool, db) => {
      await configure(db, s, 'organizer_assigned', 1, 3);
      await s.addEntry('gone-w', { assigned: '1' });
      await s.addEntry('gone-r', { assigned: '2' });
      const accepted = await s.addEntry('ok-1');
      // Keyed "accepted" but pending by category: not ready for a number.
      const decoy = await s.addEntry('accepted');
      const plan = await createStartNumberService(db).assignAll(
        s.ctx,
        s.event.id,
      );
      expect(plan).toEqual([{ entryId: accepted, startNumber: '1' }]);
      expect(plan.some((item) => item.entryId === decoy)).toBe(false);
    }));
});
